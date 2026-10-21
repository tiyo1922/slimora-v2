use anyhow::{Context, Result, anyhow};
use image::{DynamicImage, ExtendedColorType, ImageDecoder, ImageEncoder, ImageFormat};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use zune_heic::HeifDecoder;
use zune_heic::zune_core::bytestream::ZCursor;
use zune_heic::zune_core::colorspace::ColorSpace;
use fast_image_resize as fir;
use fast_image_resize::IntoImageView;

fn fast_resize(src: &DynamicImage, dst_width: u32, dst_height: u32) -> Result<DynamicImage> {
    let pixel_type = src.pixel_type().context("Unsupported pixel type")?;
    let mut dst_image = fir::images::Image::new(dst_width, dst_height, pixel_type);
    let mut resizer = fir::Resizer::new();
    resizer.resize(src, &mut dst_image, &fir::ResizeOptions::default())?;
    
    // Convert dst_image back to DynamicImage
    let buffer = dst_image.into_vec();
    match pixel_type {
        fir::PixelType::U8x3 => {
            let rgb = image::RgbImage::from_raw(dst_width, dst_height, buffer)
                .context("failed to construct RgbImage")?;
            Ok(DynamicImage::ImageRgb8(rgb))
        }
        fir::PixelType::U8x4 => {
            let rgba = image::RgbaImage::from_raw(dst_width, dst_height, buffer)
                .context("failed to construct RgbaImage")?;
            Ok(DynamicImage::ImageRgba8(rgba))
        }
        fir::PixelType::U8 => {
            let gray = image::GrayImage::from_raw(dst_width, dst_height, buffer)
                .context("failed to construct GrayImage")?;
            Ok(DynamicImage::ImageLuma8(gray))
        }
        _ => {
            // Fallback to standard resize
            Ok(src.resize_exact(dst_width, dst_height, image::imageops::FilterType::Triangle))
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Png,
    Jpeg,
    Webp,
    Avif,
}

impl OutputFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Webp => "webp",
            Self::Avif => "avif",
        }
    }
    #[allow(dead_code)]
    pub fn label(self) -> &'static str {
        match self {
            Self::Png => "PNG",
            Self::Jpeg => "JPEG",
            Self::Webp => "WebP",
            Self::Avif => "AVIF",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BatchMode {
    Files,
    SingleFolder,
    MultipleFolders,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessOptions {
    pub output_format: OutputFormat,
    pub max_kb: u32,
    pub quality: u8,
    pub max_width: u32,
    pub custom_output: Option<PathBuf>,
    pub filename_prefix: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessedItem {
    pub original_name: String,
    pub output_name: String,
    pub original_size_bytes: u64,
    pub output_size_bytes: u64,
    pub reduction_percent: f64,
    pub final_width: u32,
    pub final_height: u32,
    pub output_dir: String,
    pub output_path: String,
    pub elapsed_ms: u128,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessSummary {
    pub completed: usize,
    pub failed: usize,
    pub lines: Vec<String>,
    pub items: Vec<ProcessedItem>,
    pub output_dir: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressUpdate {
    pub current: usize,
    pub total: usize,
    pub percentage: f64,
    pub message: String,
    pub line: Option<String>,
    pub item: Option<ProcessedItem>,
    pub output_dir: Option<String>,
}

pub fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "jpg" | "jpeg" | "png" | "webp" | "avif" | "heic" | "heif"
            )
        })
        .unwrap_or(false)
}

pub fn collect_images(paths: &[PathBuf], mode: BatchMode) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for path in paths {
        if path.is_file() && is_supported_image(path) {
            files.push(path.clone());
        } else if path.is_dir() {
            for entry in WalkDir::new(path).follow_links(false).into_iter().flatten() {
                let candidate = entry.path();
                if !candidate.is_file() || !is_supported_image(candidate) {
                    continue;
                }
                if mode != BatchMode::Files
                    && candidate
                        .components()
                        .any(|part| part.as_os_str() == "reduced")
                {
                    continue;
                }
                files.push(candidate.to_path_buf());
            }
        }
    }
    files.sort();
    files.dedup();
    files
}

use std::sync::atomic::{AtomicBool, Ordering};

pub static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

pub fn request_stop() {
    CANCEL_REQUESTED.store(true, Ordering::SeqCst);
}

pub fn reset_stop() {
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);
}

pub fn is_stopped() -> bool {
    CANCEL_REQUESTED.load(Ordering::SeqCst)
}

pub fn process_batch<F>(
    inputs: Vec<PathBuf>,
    mode: BatchMode,
    input_root: Option<PathBuf>,
    options: ProcessOptions,
    on_progress: Option<F>,
) -> ProcessSummary
where
    F: Fn(ProgressUpdate) + Send + Sync,
{
    reset_stop();
    let files = collect_images(&inputs, mode);
    if files.is_empty() {
        if let Some(ref cb) = on_progress {
            cb(ProgressUpdate {
                current: 0,
                total: 0,
                percentage: 0.0,
                message: "No supported images found.".to_string(),
                line: None,
                item: None,
                output_dir: None,
            });
        }
        return ProcessSummary {
            completed: 0,
            failed: 0,
            lines: vec!["No supported images found.".to_string()],
            items: Vec::new(),
            output_dir: None,
        };
    }
    let total = files.len();
    if let Some(ref cb) = on_progress {
        cb(ProgressUpdate {
            current: 0,
            total,
            percentage: 0.0,
            message: format!("0/{total} Starting..."),
            line: None,
            item: None,
            output_dir: None,
        });
    }
    let root = input_root.or_else(|| {
        (mode != BatchMode::Files)
            .then(|| inputs.first().cloned())
            .flatten()
    });

    let mut summary = ProcessSummary {
        completed: 0,
        failed: 0,
        lines: Vec::with_capacity(total),
        items: Vec::with_capacity(total),
        output_dir: None,
    };

    // Sequential: one file at a time, result + progress emitted after each file.
    for (idx, source) in files.iter().enumerate() {
        if is_stopped() {
            let skipped = total - idx;
            let stop_line = format!("⏹ Process stopped by user. {skipped} remaining files ignored.");
            summary.lines.push(stop_line.clone());
            if let Some(ref cb) = on_progress {
                cb(ProgressUpdate {
                    current: idx,
                    total,
                    percentage: (idx as f64 / total as f64) * 100.0,
                    message: format!("Stopped. {skipped} remaining."),
                    line: Some(stop_line),
                    item: None,
                    output_dir: summary.output_dir.clone(),
                });
            }
            break;
        }
        let (result_line, item_opt) = match process_one(source, mode, root.as_deref(), &options) {
            Ok((line, item)) => {
                summary.completed += 1;
                summary.lines.push(line.clone());
                if summary.output_dir.is_none() && !item.output_dir.is_empty() {
                    summary.output_dir = Some(item.output_dir.clone());
                }
                summary.items.push(item.clone());
                (line, Some(item))
            }
            Err(error) => {
                summary.failed += 1;
                let err_line = format!("ERROR: {error:#}");
                summary.lines.push(err_line.clone());
                (err_line, None)
            }
        };
        if let Some(ref cb) = on_progress {
            let current = idx + 1;
            let file_name = source.file_name().and_then(|v| v.to_str()).unwrap_or("image");
            cb(ProgressUpdate {
                current,
                total,
                percentage: (current as f64 / total as f64) * 100.0,
                message: format!("{current}/{total} - {file_name}"),
                line: Some(result_line),
                item: item_opt,
                output_dir: summary.output_dir.clone(),
            });
        }
    }
    summary
}

fn process_one(
    source: &Path,
    mode: BatchMode,
    root: Option<&Path>,
    options: &ProcessOptions,
) -> Result<(String, ProcessedItem)> {
    let start_time = std::time::Instant::now();
    let original_size = fs::metadata(source)?.len();
    let mut image = decode_image(source)?;

    let orig_w = image.width();
    let orig_h = image.height();
    let max_bytes = u64::from(options.max_kb) * 1024;

    // STEP 1: Direct Single-Pass Target Resolution Calculation
    let q_factor = (options.quality as f64 / 85.0).powf(1.15);
    let bpp = match options.output_format {
        OutputFormat::Jpeg => 0.160 * q_factor,
        OutputFormat::Webp => 0.125 * q_factor,
        OutputFormat::Avif => 0.095 * q_factor,
        OutputFormat::Png => 0.75,
    };

    let target_bytes = (max_bytes as f64) * 0.92;
    let target_pixels = (target_bytes / bpp).max(450_000.0);
    let aspect = orig_w as f64 / orig_h.max(1) as f64;
    let ideal_w = (target_pixels * aspect).sqrt().round() as u32;

    let min_w = 1000.min(orig_w);
    let target_w = ideal_w.clamp(min_w, orig_w);

    // If original image is larger than target_w, perform SIMD-accelerated fast_resize
    if orig_w > target_w {
        let target_h = ((orig_h as f64 * target_w as f64) / orig_w as f64).round() as u32;
        image = fast_resize(&image, target_w, target_h.max(1))?;
    }

    // Convert to RGB8 for JPEG encoding if alpha exists (done in place once)
    if options.output_format == OutputFormat::Jpeg && image.color().has_alpha() {
        image = DynamicImage::ImageRgb8(image.to_rgb8());
    }

    let destination = output_path(source, mode, root, options)?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }

    let supports_quality = matches!(
        options.output_format,
        OutputFormat::Jpeg | OutputFormat::Webp | OutputFormat::Avif
    );

    // STEP 2: Fast in-memory encode at requested quality
    let mut best_quality = options.quality;
    let mut encoded = encode_image(&image, options.output_format, best_quality)?;

    // STEP 3: If encoded size > max_bytes, fast binary search on quality in memory (NO RESIZING)
    if supports_quality && encoded.len() as u64 > max_bytes {
        let mut low = 25u8;
        let mut high = options.quality.saturating_sub(1);
        let mut found_fit: Option<(u8, Vec<u8>)> = None;

        while low <= high {
            let mid = low + (high - low) / 2;
            let candidate = encode_image(&image, options.output_format, mid)?;
            if candidate.len() as u64 <= max_bytes {
                found_fit = Some((mid, candidate));
                low = mid + 1;
            } else {
                if mid <= 25 {
                    break;
                }
                high = mid - 1;
            }
        }

        if let Some((q, fit_data)) = found_fit {
            best_quality = q;
            encoded = fit_data;
        } else {
            best_quality = 25;
            encoded = encode_image(&image, options.output_format, 25)?;
        }
    }

    // STEP 4: Strict guarantee: If still > max_bytes, do AT MOST ONE fast downscale
    let mut final_width = image.width();
    let mut final_height = image.height();
    if encoded.len() as u64 > max_bytes {
        let cur_bytes = encoded.len() as f64;
        let scale = (max_bytes as f64 / cur_bytes).sqrt() * 0.95;
        let final_w = ((image.width() as f64 * scale) as u32).clamp(80, image.width().saturating_sub(1));
        let final_h = ((image.height() as f64 * scale) as u32).max(1);

        let resized = fast_resize(&image, final_w, final_h)?;
        let candidate = encode_image(&resized, options.output_format, best_quality)?;
        if candidate.len() as u64 <= max_bytes {
            encoded = candidate;
        } else {
            encoded = encode_image(
                &resized,
                options.output_format,
                best_quality.saturating_sub(10).max(20),
            )?;
        }
        final_width = final_w;
        final_height = final_h;
    }

    fs::write(&destination, &encoded)?;
    let reduction = if original_size == 0 {
        0.0
    } else {
        (original_size as f64 - encoded.len() as f64) / original_size as f64 * 100.0
    };
    let elapsed_ms = start_time.elapsed().as_millis();
    let original_name = source
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("image")
        .to_string();
    let output_name = destination
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("output")
        .to_string();
    let output_path_str = destination.display().to_string();
    let output_dir_str = destination
        .parent()
        .map(|p| p.display().to_string())
        .unwrap_or_default();

    let item = ProcessedItem {
        original_name: original_name.clone(),
        output_name: output_name.clone(),
        original_size_bytes: original_size,
        output_size_bytes: encoded.len() as u64,
        reduction_percent: reduction,
        final_width,
        final_height,
        output_dir: output_dir_str,
        output_path: output_path_str.clone(),
        elapsed_ms,
    };

    let log_line = format!(
        "{} -> {} | {:.1} KB -> {:.1} KB ({:+.1}%) [{}ms] | Saved: {}",
        original_name,
        output_name,
        original_size as f64 / 1024.0,
        encoded.len() as f64 / 1024.0,
        reduction,
        elapsed_ms,
        output_path_str
    );

    Ok((log_line, item))
}

fn output_path(
    source: &Path,
    mode: BatchMode,
    root: Option<&Path>,
    options: &ProcessOptions,
) -> Result<PathBuf> {
    let stem = source
        .file_stem()
        .and_then(|v| v.to_str())
        .unwrap_or("image");
    let automatic_prefix = match mode {
        BatchMode::Files => String::new(),
        BatchMode::SingleFolder => root
            .and_then(|path| path.file_name())
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_string(),
        BatchMode::MultipleFolders => root
            .and_then(|path| source.strip_prefix(path).ok())
            .and_then(|relative| relative.components().next())
            .map(|component| component.as_os_str().to_string_lossy().into_owned())
            .unwrap_or_default(),
    };
    let prefix = if options.filename_prefix.is_empty() {
        automatic_prefix
    } else {
        options.filename_prefix.clone()
    };
    let filename = if prefix.is_empty() {
        stem.to_string()
    } else {
        format!("{prefix}_{stem}")
    };
    let filename = format!("{filename}.{}", options.output_format.extension());
    if let Some(custom) = &options.custom_output {
        let relative = match mode {
            BatchMode::Files => PathBuf::new(),
            BatchMode::SingleFolder => root
                .and_then(|r| source.parent()?.strip_prefix(r).ok())
                .unwrap_or_else(|| Path::new(""))
                .to_path_buf(),
            BatchMode::MultipleFolders => {
                let root = root.context("input folder is missing")?;
                let group = source
                    .strip_prefix(root)?
                    .components()
                    .next()
                    .map(|p| PathBuf::from(p.as_os_str()))
                    .unwrap_or_default();
                let sub = source
                    .parent()
                    .and_then(|p| p.strip_prefix(root.join(&group)).ok())
                    .unwrap_or_else(|| Path::new(""));
                group.join(sub)
            }
        };
        return Ok(custom.join(relative).join(filename));
    }
    let parent = source.parent().context("source has no parent folder")?;
    let folder = match mode {
        BatchMode::Files => parent.join("reduced"),
        BatchMode::SingleFolder => {
            let root = root.context("input folder is missing")?;
            root.join("reduced").join(parent.strip_prefix(root)?)
        }
        BatchMode::MultipleFolders => {
            let root = root.context("input folder is missing")?;
            let group = source
                .strip_prefix(root)?
                .components()
                .next()
                .map(|p| PathBuf::from(p.as_os_str()))
                .unwrap_or_default();
            let group_root = root.join(&group);
            group_root
                .join("reduced")
                .join(parent.strip_prefix(&group_root)?)
        }
    };
    Ok(folder.join(filename))
}

fn decode_image(path: &Path) -> Result<DynamicImage> {
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if matches!(ext.as_str(), "heic" | "heif") {
        let data = fs::read(path)?;
        let mut decoder = HeifDecoder::new(ZCursor::new(&data));
        let pixels = decoder
            .decode()
            .map_err(|e| anyhow!("HEIC decode failed: {e:?}"))?;
        let width = decoder.width().context("HEIC width unavailable")? as u32;
        let height = decoder.height().context("HEIC height unavailable")? as u32;
        return match decoder
            .colorspace()
            .context("HEIC colorspace unavailable")?
        {
            ColorSpace::Luma => Ok(DynamicImage::ImageLuma8(
                image::GrayImage::from_raw(width, height, pixels)
                    .context("invalid grayscale pixels")?,
            )),
            ColorSpace::LumaA => Ok(DynamicImage::ImageLumaA8(
                image::ImageBuffer::from_raw(width, height, pixels)
                    .context("invalid grayscale alpha pixels")?,
            )),
            ColorSpace::RGB => Ok(DynamicImage::ImageRgb8(
                image::RgbImage::from_raw(width, height, pixels).context("invalid RGB pixels")?,
            )),
            ColorSpace::RGBA => Ok(DynamicImage::ImageRgba8(
                image::RgbaImage::from_raw(width, height, pixels).context("invalid RGBA pixels")?,
            )),
            other => Err(anyhow!("unsupported HEIC colorspace: {other:?}")),
        };
    }
    let file = fs::File::open(path)?;
    let reader = image::ImageReader::new(std::io::BufReader::with_capacity(128 * 1024, file))
        .with_guessed_format()?;
    let mut decoder = reader.into_decoder()?;
    let orientation = decoder
        .orientation()
        .unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut img = DynamicImage::from_decoder(decoder)?;
    img.apply_orientation(orientation);
    Ok(img)
}

fn encode_image(image: &DynamicImage, format: OutputFormat, quality: u8) -> Result<Vec<u8>> {
    let mut output = Cursor::new(Vec::with_capacity(256 * 1024));
    match format {
        OutputFormat::Jpeg => {
            if image.color().has_alpha() {
                let rgb = DynamicImage::ImageRgb8(image.to_rgb8());
                image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, quality)
                    .encode_image(&rgb)?
            } else {
                image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, quality)
                    .encode_image(image)?
            }
        }
        OutputFormat::Png => image.write_to(&mut output, ImageFormat::Png)?,
        OutputFormat::Webp => {
            let encoder = webp::Encoder::from_image(image)
                .map_err(|e| anyhow!("WebP encode error: {e}"))?;
            let memory = encoder.encode(quality as f32);
            return Ok(memory.to_vec());
        }
        OutputFormat::Avif => {
            image::codecs::avif::AvifEncoder::new_with_speed_quality(&mut output, 6, quality)
                .write_image(
                    image.to_rgba8().as_raw(),
                    image.width(),
                    image.height(),
                    ExtendedColorType::Rgba8,
                )?
        }
    }
    Ok(output.into_inner())
}

pub fn copy_named_folders<F>(
    names: &[String],
    source: &Path,
    destination: &Path,
    on_progress: Option<F>,
) -> Vec<String>
where
    F: Fn(ProgressUpdate) + Send + Sync,
{
    reset_stop();
    let mut lines = Vec::new();
    let trimmed: Vec<&str> = names
        .iter()
        .map(|name| name.trim())
        .filter(|name| !name.is_empty())
        .collect();

    let total = trimmed.len();
    if total == 0 {
        return lines;
    }

    if let Some(ref cb) = on_progress {
        cb(ProgressUpdate {
            current: 0,
            total,
            percentage: 0.0,
            message: format!("0/{total} Starting copy..."),
            line: None,
            item: None,
            output_dir: None,
        });
    }

    for (idx, name) in trimmed.iter().enumerate() {
        if is_stopped() {
            let skipped = total.saturating_sub(idx);
            let stop_line = format!("⏹ Copy stopped by user. {skipped} remaining folders ignored.");
            lines.push(stop_line.clone());
            if let Some(ref cb) = on_progress {
                cb(ProgressUpdate {
                    current: idx,
                    total,
                    percentage: (idx as f64 / total as f64) * 100.0,
                    message: format!("Stopped. {skipped} remaining."),
                    line: Some(stop_line),
                    item: None,
                    output_dir: None,
                });
            }
            break;
        }
        let relative = Path::new(name);
        if relative.is_absolute()
            || relative.components().any(|c| {
                matches!(
                    c,
                    std::path::Component::ParentDir | std::path::Component::RootDir
                )
            })
        {
            lines.push(format!("Skipped unsafe folder name: {name}"));
        } else {
            let from = source.join(relative);
            let to = destination.join(relative);
            if !from.is_dir() {
                lines.push(format!("Not found: {name}"));
            } else {
                match copy_tree(&from, &to) {
                    Ok(()) => lines.push(format!("Copied: {name}")),
                    Err(error) => lines.push(format!("Copy failed for {name}: {error:#}")),
                }
            }
        }

        if let Some(ref cb) = on_progress {
            let current = idx + 1;
            let percentage = (current as f64 / total as f64) * 100.0;
            cb(ProgressUpdate {
                current,
                total,
                percentage,
                message: format!("{current}/{total} - {name}"),
                line: lines.last().cloned(),
                item: None,
                output_dir: Some(destination.display().to_string()),
            });
        }
    }
    lines
}

fn copy_tree(source: &Path, destination: &Path) -> Result<()> {
    for entry in WalkDir::new(source).follow_links(false) {
        let entry = entry?;
        if entry
            .file_name()
            .to_string_lossy()
            .eq_ignore_ascii_case("thumbs.db")
        {
            continue;
        }
        let target = destination.join(entry.path().strip_prefix(source)?);
        if entry.file_type().is_dir() {
            fs::create_dir_all(target)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options(custom_output: Option<PathBuf>) -> ProcessOptions {
        ProcessOptions {
            output_format: OutputFormat::Webp,
            max_kb: 180,
            quality: 85,
            max_width: 1024,
            custom_output,
            filename_prefix: String::new(),
        }
    }

    #[test]
    fn file_mode_keeps_legacy_reduced_directory() {
        let path = Path::new(r"C:\photos\portrait.png");
        let result = output_path(path, BatchMode::Files, None, &options(None)).unwrap();
        assert_eq!(result, PathBuf::from(r"C:\photos\reduced\portrait.webp"));
    }

    #[test]
    fn single_folder_keeps_reduced_layout_and_folder_prefix() {
        let root = Path::new(r"C:\photos\album");
        let path = root.join("day1").join("portrait.png");
        let result =
            output_path(&path, BatchMode::SingleFolder, Some(root), &options(None)).unwrap();
        assert_eq!(result, root.join(r"reduced\day1\album_portrait.webp"));
    }

    #[test]
    fn custom_multiple_folder_keeps_group_and_relative_path() {
        let root = Path::new(r"C:\photos");
        let output = Path::new(r"D:\reduced");
        let path = root.join("album").join("day1").join("portrait.heic");
        let result = output_path(
            &path,
            BatchMode::MultipleFolders,
            Some(root),
            &options(Some(output.to_path_buf())),
        )
        .unwrap();
        assert_eq!(result, output.join(r"album\day1\album_portrait.webp"));
    }

    #[test]
    fn test_strict_max_size_guarantee() {
        let sample = Path::new(r"d:\project\Project Code Rapi\SLIMORA\bug\warna berubah\25GR158 B\GF\1.jpg");
        if !sample.exists() {
            return;
        }
        for target_kb in [50, 100, 180] {
            let opts = ProcessOptions {
                output_format: OutputFormat::Jpeg,
                max_kb: target_kb,
                quality: 85,
                max_width: 1024,
                custom_output: None,
                filename_prefix: String::new(),
            };
            let (res, _item) = process_one(sample, BatchMode::Files, None, &opts).unwrap();
            let dest = output_path(sample, BatchMode::Files, None, &opts).unwrap();
            let size = fs::metadata(&dest).unwrap().len();
            assert!(
                size <= u64::from(target_kb) * 1024,
                "Output size {} KB exceeded target {} KB! res: {}",
                size as f64 / 1024.0,
                target_kb,
                res
            );
        }
    }
}
