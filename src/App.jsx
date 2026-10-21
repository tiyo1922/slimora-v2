import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { NavIcon, InfoIcon } from './Icons';
import StripeProgress from './StripeProgress';
import './App.css';

export default function App() {
  const [page, setPage] = useState('file'); // 'file' | 'single' | 'multiple' | 'copy'
  const [files, setFiles] = useState([]);
  const [inputFolder, setInputFolder] = useState('');
  const [outputFolder, setOutputFolder] = useState('');
  const [customOutput, setCustomOutput] = useState(false);
  const [format, setFormat] = useState('jpeg');
  const [maxKb, setMaxKb] = useState('180');
  const [quality, setQuality] = useState(85);
  const [prefix, setPrefix] = useState('');
  const [folderNames, setFolderNames] = useState('');
  const [copySource, setCopySource] = useState('');
  const [copyDestination, setCopyDestination] = useState('');
  const [logs, setLogs] = useState([]);
  const [processedItems, setProcessedItems] = useState([]);
  const [outputDir, setOutputDir] = useState('');
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState(0);

  // Listen for real-time progress updates from backend
  useEffect(() => {
    let unlisten;
    let active = true;

    async function bindProgress() {
      try {
        unlisten = await listen('process-progress', (event) => {
          if (!active) return;
          if (event && event.payload) {
            const { percentage, line, item, outputDir: outDir } = event.payload;
            if (typeof percentage === 'number') {
              setProgress(percentage);
            }
            if (line) {
              addLog(line);
            }
            if (item) {
              setProcessedItems((prev) => [...prev, item]);
            }
            if (outDir) {
              setOutputDir(outDir);
            }
          }
        });
      } catch (err) {
        console.error('[Tauri] listen error for process-progress:', err);
      }
    }

    bindProgress();

    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, []);

  const addLog = (text) => {
    setLogs((prev) => [...prev, text]);
  };

  const handleClearLogs = () => {
    setLogs([]);
    setProcessedItems([]);
    setOutputDir('');
  };

  // Drag & drop support via Tauri WebView event
  useEffect(() => {
    let unlisten;
    try {
      getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === 'drop') {
          const dropped = event.payload.paths || [];
          if (dropped.length > 0) {
            if (page === 'file') {
              const supported = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'heif'];
              const filtered = dropped.filter((p) => {
                const ext = p.split('.').pop()?.toLowerCase();
                return supported.includes(ext);
              });
              if (filtered.length > 0) {
                setFiles(filtered);
                setProgress(0);
                addLog(`Dropped ${filtered.length} new image(s)`);
              }
            } else if (page !== 'copy') {
              setInputFolder(dropped[0]);
              setProgress(0);
              addLog(`Source folder selected: ${dropped[0]}`);
            }
          }
        }
      }).then((fn) => {
        unlisten = fn;
      });
    } catch {
      // Fallback for browser preview
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, [page]);

  // File / folder picking
  const handlePickFiles = async () => {
    try {
      const selected = await invoke('pick_files');
      if (selected && selected.length > 0) {
        setFiles(selected);
        setProgress(0);
        addLog(`Selected ${selected.length} image(s)`);
      }
    } catch (err) {
      addLog(`File pick error: ${err}`);
    }
  };

  const handlePickInputFolder = async () => {
    try {
      const folder = await invoke('pick_folder');
      if (folder) {
        setInputFolder(folder);
        addLog(`Source folder set: ${folder}`);
      }
    } catch (err) {
      addLog(`Folder pick error: ${err}`);
    }
  };

  const handlePickOutputFolder = async () => {
    try {
      const folder = await invoke('pick_folder');
      if (folder) {
        setOutputFolder(folder);
        addLog(`Output folder set: ${folder}`);
      }
    } catch (err) {
      addLog(`Folder pick error: ${err}`);
    }
  };

  const handlePickCopySource = async () => {
    try {
      const folder = await invoke('pick_folder');
      if (folder) setCopySource(folder);
    } catch (err) {
      addLog(`Source pick error: ${err}`);
    }
  };

  const handlePickCopyDestination = async () => {
    try {
      const folder = await invoke('pick_folder');
      if (folder) setCopyDestination(folder);
    } catch (err) {
      addLog(`Destination pick error: ${err}`);
    }
  };

  // Execution
  const handleStart = async () => {
    if (busy) return;

    if (page === 'copy') {
      if (!copySource || !copyDestination) {
        addLog('Error: Choose source and destination folders.');
        return;
      }
      const names = folderNames
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      if (names.length === 0) {
        addLog('Error: Enter folder names, one per line.');
        return;
      }

      setBusy(true);
      setProgress(0);
      try {
        const summary = await invoke('copy_named_folders', {
          names,
          source: copySource,
          destination: copyDestination,
        });
        setProgress(100);
        addLog(`Finished: ${summary.completed} copied, ${summary.failed} failed`);
      } catch (err) {
        addLog(`Copy error: ${err}`);
      } finally {
        setBusy(false);
        setStopping(false);
      }
      return;
    }

    // Compression modes
    const mode = page === 'multiple' ? 'multiplefolders' : page === 'single' ? 'singlefolder' : 'files';
    const input = mode === 'files' ? files : inputFolder ? [inputFolder] : [];

    if (input.length === 0) {
      addLog('Error: Choose image files or a source folder.');
      return;
    }

    if (customOutput && !outputFolder) {
      addLog('Error: Choose a target output folder or turn off the option.');
      return;
    }

    const options = {
      outputFormat: format,
      maxKb: Math.max(1, Math.min(5000, parseInt(maxKb, 10) || 180)),
      quality: quality,
      maxWidth: 1024,
      customOutput: customOutput && outputFolder ? outputFolder : null,
      filenamePrefix: prefix.trim(),
    };

    setBusy(true);
    setProgress(0);
    setProcessedItems([]);
    try {
      const summary = await invoke('process_images', {
        input,
        mode,
        root: inputFolder || null,
        options,
      });
      setProgress(100);
      if (summary.items && summary.items.length > 0) {
        setProcessedItems(summary.items);
      }
      if (summary.outputDir) {
        setOutputDir(summary.outputDir);
      }
      addLog(`Finished: ${summary.completed} completed, ${summary.failed} failed`);
    } catch (err) {
      addLog(`Process error: ${err}`);
    } finally {
      setBusy(false);
      setStopping(false);
    }
  };

  const handleStop = async () => {
    if (stopping) return;
    setStopping(true);
    addLog('⏹ Stopping process... finishing current file');
    try {
      await invoke('stop_process');
    } catch (err) {
      addLog(`Stop error: ${err}`);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const getFormatBadgeClass = (ext) => {
    const clean = (ext || '').replace('.', '').toLowerCase();
    switch (clean) {
      case 'webp': return 'ext-webp';
      case 'jpg':
      case 'jpeg': return 'ext-jpg';
      case 'png': return 'ext-png';
      case 'avif': return 'ext-avif';
      default: return 'ext-default';
    }
  };

  const renderActivityPanel = () => {
    const activeOutputDir = outputDir || (
      page === 'copy'
        ? copyDestination
        : (customOutput && outputFolder
            ? outputFolder
            : (inputFolder
                ? `${inputFolder}\\reduced`
                : (files.length > 0 && files[0]
                    ? `${files[0].substring(0, Math.max(files[0].lastIndexOf('\\'), files[0].lastIndexOf('/')))}\\reduced`
                    : '')))
    );

    return (
      <div className="panel activity-panel">
        <div className="activity-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="panel-header">› Log Aktivitas</span>
            {processedItems.length > 0 && (
              <span className="activity-count-badge">
                {processedItems.length} berkas
              </span>
            )}
          </div>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={handleClearLogs}>
            Clear
          </button>
        </div>

        {/* Output Directory Banner */}
        <div className="activity-output-banner">
          <div className="output-banner-left">
            <span className="output-banner-tag">OUTPUT :</span>
            <span className="output-banner-path" title={activeOutputDir || 'Direktori target output'}>
              {activeOutputDir || '[Direktori target output]'}
            </span>
          </div>
          {activeOutputDir && (
            <button
              type="button"
              className="btn-open-explorer"
              onClick={() => invoke('open_folder', { path: activeOutputDir })}
              title="Buka direktori target output di Explorer"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span>Buka Folder</span>
            </button>
          )}
        </div>

        {/* Activity Content: Table or Text Logs */}
        <div className="activity-table-wrapper">
          {processedItems.length > 0 ? (
            <table className="activity-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '100px' }} title="Nama berkas asli">File Ori</th>
                  <th style={{ minWidth: '110px' }} title="Nama berkas output">Output</th>
                  <th style={{ minWidth: '75px' }} title="Ukuran berkas asli">Size Ori</th>
                  <th style={{ minWidth: '85px' }} title="Ukuran setelah downscale">Size Akhir</th>
                  <th style={{ minWidth: '95px' }} title="Persentase penurunan & rasio hemat">Hemat</th>
                  <th style={{ minWidth: '105px' }} title="Resolusi pixel akhir (lebar × tinggi)">Resolusi</th>
                </tr>
              </thead>
              <tbody>
                {processedItems.map((item, idx) => {
                  const ext = item.outputName.split('.').pop() || '';
                  const ratio = item.outputSizeBytes > 0 && item.originalSizeBytes > item.outputSizeBytes
                    ? (item.originalSizeBytes / item.outputSizeBytes).toFixed(1)
                    : null;
                  return (
                    <tr key={idx}>
                      <td className="cell-orig-name" title={item.originalName}>
                        <span className="file-name-text">{item.originalName}</span>
                      </td>
                      <td className="cell-output-name" title={item.outputName}>
                        <div className="cell-output-wrap">
                          <span className={`ext-tag ${getFormatBadgeClass(ext)}`}>.{ext}</span>
                          <span className="file-name-text">{item.outputName}</span>
                        </div>
                      </td>
                      <td className="cell-size-orig">
                        <span className="size-badge-orig">{formatBytes(item.originalSizeBytes)}</span>
                      </td>
                      <td className="cell-size-output">
                        <span className="size-badge-downscale">{formatBytes(item.outputSizeBytes)}</span>
                      </td>
                      <td className="cell-reduction">
                        <div className="reduction-cell">
                          <span className={`reduction-pill ${item.reductionPercent >= 0 ? 'pill-positive' : 'pill-negative'}`}>
                            {item.reductionPercent >= 0 ? `↓ ${item.reductionPercent.toFixed(1)}%` : `+${Math.abs(item.reductionPercent).toFixed(1)}%`}
                          </span>
                          {ratio && <span className="reduction-ratio">{ratio}x</span>}
                        </div>
                      </td>
                      <td className="cell-dimensions">
                        {item.finalWidth > 0 ? (
                          <span className="dimensions-pill">
                            {item.finalWidth} × {item.finalHeight} px
                          </span>
                        ) : (
                          <span className="dimensions-empty">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : logs.length > 0 ? (
            <div className="activity-text-logs">
              {logs.map((log, i) => (
                <div key={i} className="log-entry">{log}</div>
              ))}
            </div>
          ) : (
            <div className="activity-empty-state">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.6">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>Belum ada aktivitas pemrosesan</span>
              <small>Klik tombol START untuk mulai memproses gambar</small>
            </div>
          )}
        </div>
      </div>
    );
  };

  const navItems = [
    { id: 'multiple', label: 'Multiple Folder', desc: 'Batch compress folders' },
    { id: 'single', label: 'Single Folder', desc: 'Compress one folder' },
    { id: 'file', label: 'File', desc: 'Compress single file' },
    { id: 'copy', label: 'Copy Folder', desc: 'Duplicate and compress' },
  ];

  const pageMeta = {
    file: { badge: 'FILE', title: 'File Compression', desc: 'Compress your images with high quality and keep the best result.' },
    single: { badge: 'SINGLE FOLDER', title: 'Single Folder Compression', desc: 'Compress images in a folder with high quality.' },
    multiple: { badge: 'MULTIPLE FOLDER', title: 'Multiple Folder Compression', desc: 'Batch process multiple folders effortlessly.' },
    copy: { badge: 'COPY', title: 'Copy Folder', desc: 'Copy selected folders to a destination while preserving structure.' },
  }[page];

  return (
    <div className="app-container">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src="/assets/logo.png" alt="Slimora Logo" className="brand-logo" />
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => setPage(item.id)}
              >
                {active && <span className="nav-indicator" />}
                <div className="nav-icon-container">
                  <NavIcon kind={item.id} active={active} />
                </div>
                <div className="nav-text">
                  <span className="nav-label">{item.label}</span>
                  <span className="nav-desc">{item.desc}</span>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-divider" />
          <div className="version-info">
            <InfoIcon />
            <span>Version 2.0.1</span>
          </div>
        </div>
      </aside>

      {/* MAIN VIEW */}
      <main className="main-content">
        <header className="content-header">
          <div className="header-meta">
            <span className="badge">{pageMeta.badge}</span>
            <h1 className="page-title">{pageMeta.title}</h1>
            <p className="page-desc">{pageMeta.desc}</p>
          </div>
        </header>

        <div className="content-body">
          {page === 'copy' ? (
            /* COPY MODE */
            <>
              <div className="body-left">
                <div className="panel" style={{ flex: 1, gap: 14 }}>
                  <div className="field-group">
                    <label className="field-label">Folder names</label>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Enter one folder name per line</span>
                    <textarea
                      rows={5}
                      className="input-text"
                      placeholder="Folder A, Folder B..."
                      value={folderNames}
                      onChange={(e) => setFolderNames(e.target.value)}
                      style={{ resize: 'vertical' }}
                    />
                  </div>

                  <div className="picker-row">
                    <div className="picker-info">
                      <span className="picker-label">Source folder</span>
                      <span className="picker-path">{copySource || 'Not selected'}</span>
                    </div>
                    <button className="btn-secondary" onClick={handlePickCopySource}>
                      Browse
                    </button>
                  </div>

                  <div className="picker-row">
                    <div className="picker-info">
                      <span className="picker-label">Destination folder</span>
                      <span className="picker-path">{copyDestination || 'Not selected'}</span>
                    </div>
                    <button className="btn-secondary" onClick={handlePickCopyDestination}>
                      Browse
                    </button>
                  </div>
                </div>
              </div>

              <div className="body-right">
                {renderActivityPanel()}
              </div>
            </>
          ) : (
            /* COMPRESSION MODES */
            <>
              <div className="body-left">
                {page === 'file' ? (
                  <div className="panel" style={{ gap: 12 }}>
                    <div className="dropzone" onClick={handlePickFiles}>
                      <span className="drop-icon">⇧</span>
                      <span className="drop-title">
                        {files.length === 0 ? 'Drop images here or browse' : `${files.length} files selected`}
                      </span>
                      <span className="drop-hint">JPG · PNG · WebP · AVIF · HEIC</span>
                      <button className="btn-secondary" style={{ marginTop: 4 }}>
                        Browse files
                      </button>
                    </div>

                    {files.length > 0 && (
                      <div className="selected-files-list">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-dark)' }}>
                            {files.length} file{files.length > 1 ? 's' : ''} ready
                          </span>
                          <button
                            type="button"
                            style={{
                              padding: '2px 8px',
                              fontSize: 11,
                              fontWeight: 600,
                              border: '1px solid #fecaca',
                              borderRadius: 4,
                              background: '#fef2f2',
                              color: '#dc2626',
                              cursor: 'pointer',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFiles([]);
                              setProgress(0);
                              addLog('Cleared file queue');
                            }}
                          >
                            ✕ Clear
                          </button>
                        </div>
                        {files.slice(0, 4).map((f, i) => (
                          <div key={i} className="file-item">{f.split(/[\\/]/).pop()}</div>
                        ))}
                        {files.length > 4 && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            + {files.length - 4} more files
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="panel" style={{ gap: 12 }}>
                    <div className="field-group">
                      <span className="panel-header">Source folder</span>
                      <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                        Images in this folder and its subfolders will be processed.
                      </span>
                    </div>
                    <div className="picker-row">
                      <div className="picker-info">
                        <span className="picker-path">{inputFolder || 'No source folder selected'}</span>
                      </div>
                      <button className="btn-secondary" onClick={handlePickInputFolder}>
                        Browse source folder
                      </button>
                    </div>
                  </div>
                )}

                {renderActivityPanel()}
              </div>

              <div className="body-right">
                <div className="panel settings-panel">
                  <span className="panel-header">⚙ Output Settings</span>

                  <div className="field-group">
                    <label className="field-label">Format</label>
                    <div className="format-pills">
                      {['png', 'jpeg', 'webp', 'avif'].map((fmt) => (
                        <button
                          key={fmt}
                          className={`format-btn ${format === fmt ? 'active' : ''}`}
                          onClick={() => setFormat(fmt)}
                        >
                          {fmt.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field-group">
                    <label className="field-label">Target output folder</label>
                    <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={customOutput}
                        onChange={(e) => setCustomOutput(e.target.checked)}
                      />
                      Choose another output folder
                    </label>
                    {customOutput ? (
                      <div className="picker-row" style={{ marginTop: 4 }}>
                        <div className="picker-info">
                          <span className="picker-path">{outputFolder || 'Not selected'}</span>
                        </div>
                        <button className="btn-secondary" onClick={handlePickOutputFolder}>
                          Save to
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: '#7a8ba9' }}>
                        Uses the current reduced-folder location
                      </span>
                    )}
                  </div>

                  <div className="field-group">
                    <label className="field-label">Max size (KB)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        className="input-text"
                        style={{ width: 110 }}
                        value={maxKb}
                        onChange={(e) => setMaxKb(e.target.value)}
                      />
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>KB</span>
                    </div>
                    <div className="presets-row">
                      {['50', '100', '180', '300'].map((preset) => (
                        <button
                          key={preset}
                          className={`preset-btn ${maxKb === preset ? 'active' : ''}`}
                          onClick={() => setMaxKb(preset)}
                        >
                          {preset} KB
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field-group">
                    <div className="quality-header-row">
                      <svg className="quality-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M3 7H11" stroke="#081434" strokeWidth="2.4" strokeLinecap="round" />
                        <path d="M17 7H21" stroke="#081434" strokeWidth="2.4" strokeLinecap="round" />
                        <circle cx="14" cy="7" r="2.8" fill="#ffffff" stroke="#081434" strokeWidth="2.4" />
                        
                        <path d="M3 17H7" stroke="#081434" strokeWidth="2.4" strokeLinecap="round" />
                        <path d="M13 17H21" stroke="#081434" strokeWidth="2.4" strokeLinecap="round" />
                        <circle cx="10" cy="17" r="2.8" fill="#ffffff" stroke="#081434" strokeWidth="2.4" />
                      </svg>
                      <label className="field-label quality-title">Quality</label>
                    </div>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="20"
                        max="100"
                        value={quality}
                        onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                        className="pill-slider"
                        style={{
                          '--progress-pct': `${((quality - 20) / (100 - 20)) * 100}%`
                        }}
                      />
                      <span className="slider-value-text">{quality}</span>
                    </div>
                  </div>

                  {page === 'file' && (
                    <div className="field-group">
                      <label className="field-label">Filename prefix (optional)</label>
                      <input
                        type="text"
                        className="input-text"
                        placeholder="prefix_"
                        value={prefix}
                        onChange={(e) => setPrefix(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <footer className="content-footer">
          <div className="progress-track">
            <StripeProgress progress={progress} height={24} />
          </div>
          {busy ? (
            <button
              className="btn-stop-action"
              onClick={handleStop}
              disabled={stopping}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="3" />
              </svg>
              <span>{stopping ? 'STOPPING...' : 'STOP PROCESS'}</span>
            </button>
          ) : (
            <button
              className="btn-primary-action"
              onClick={handleStart}
            >
              {page === 'copy' ? 'START COPY  →' : 'START  →'}
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}
