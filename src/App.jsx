import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import {
  NavIcon,
  InfoIcon,
  SolarGallerySendIcon,
  SolarGalleryWideIcon,
  SolarSettingsIcon,
  SolarTuningIcon,
  SolarPlayIcon,
  SolarTrashIcon,
  SolarHistoryIcon,
  SolarAddFolderIcon,
} from './Icons';
import StripeProgress from './StripeProgress';
import './App.css';

export default function App() {
  const [page, setPage] = useState('file'); // 'file' | 'single' | 'multiple' | 'copy'

  // Independent inputs per tab menu
  const [files, setFiles] = useState([]);
  const [singleFolder, setSingleFolder] = useState('');
  const [multipleFolder, setMultipleFolder] = useState('');

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [outputFolder, setOutputFolder] = useState('');
  const [customOutput, setCustomOutput] = useState(false);
  const [format, setFormat] = useState('jpeg');
  const [maxKb, setMaxKb] = useState('180');
  const [quality, setQuality] = useState(85);
  const [prefix, setPrefix] = useState('');
  const [folderNames, setFolderNames] = useState('');
  const [copySource, setCopySource] = useState('');
  const [copyDestination, setCopyDestination] = useState('');

  // Independent logs, results, output directories, and progress per tab menu
  const [tabLogs, setTabLogs] = useState({
    file: [],
    single: [],
    multiple: [],
    copy: [],
  });
  const [tabProcessedItems, setTabProcessedItems] = useState({
    file: [],
    single: [],
    multiple: [],
    copy: [],
  });
  const [tabOutputDir, setTabOutputDir] = useState({
    file: '',
    single: '',
    multiple: '',
    copy: '',
  });
  const [tabProgress, setTabProgress] = useState({
    file: 0,
    single: 0,
    multiple: 0,
    copy: 0,
  });

  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);

  // References for active and background tasks
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  const processingTabRef = useRef('file');

  // Active tab derived state
  const logs = tabLogs[page] || [];
  const processedItems = tabProcessedItems[page] || [];
  const outputDir = tabOutputDir[page] || '';
  const progress = tabProgress[page] || 0;

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
            const target = processingTabRef.current || pageRef.current || 'file';
            if (typeof percentage === 'number') {
              setTabProgress((prev) => ({ ...prev, [target]: percentage }));
            }
            if (line) {
              addLog(line, target);
            }
            if (item) {
              setTabProcessedItems((prev) => ({
                ...prev,
                [target]: [...(prev[target] || []), item],
              }));
            }
            if (outDir) {
              setTabOutputDir((prev) => ({ ...prev, [target]: outDir }));
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

  const addLog = (text, targetPage = pageRef.current) => {
    setTabLogs((prev) => ({
      ...prev,
      [targetPage]: [...(prev[targetPage] || []), text],
    }));
  };

  const handleClearLogs = () => {
    setTabLogs((prev) => ({ ...prev, [page]: [] }));
    setTabProcessedItems((prev) => ({ ...prev, [page]: [] }));
    setTabOutputDir((prev) => ({ ...prev, [page]: '' }));
    setTabProgress((prev) => ({ ...prev, [page]: 0 }));
  };

  // Drag & drop support via Tauri WebView event
  useEffect(() => {
    let unlisten;
    try {
      getCurrentWebview().onDragDropEvent(async (event) => {
        if (event.payload.type === 'enter' || event.payload.type === 'over') {
          setIsDraggingOver(true);
        } else if (event.payload.type === 'leave') {
          setIsDraggingOver(false);
        } else if (event.payload.type === 'drop') {
          setIsDraggingOver(false);
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
                setTabProgress((prev) => ({ ...prev, file: 0 }));
                addLog(`Dropped ${filtered.length} new image(s)`, 'file');
              }
            } else if (page === 'single') {
              let targetPath = dropped[0];
              try {
                const resolved = await invoke('resolve_folder_path', { path: targetPath });
                if (resolved) targetPath = resolved;
              } catch {
                const imgExts = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'heif'];
                const seg = targetPath.split(/[\\/]/).pop() || '';
                const ext = seg.includes('.') ? seg.split('.').pop()?.toLowerCase() : null;
                if (ext && imgExts.includes(ext)) {
                  const parent = targetPath.substring(0, Math.max(targetPath.lastIndexOf('\\'), targetPath.lastIndexOf('/')));
                  if (parent) targetPath = parent;
                }
              }
              setSingleFolder(targetPath);
              setTabProgress((prev) => ({ ...prev, single: 0 }));
              addLog(`Single folder selected: ${targetPath}`, 'single');
            } else if (page === 'multiple') {
              let targetPath = dropped[0];
              try {
                const resolved = await invoke('resolve_folder_path', { path: targetPath });
                if (resolved) targetPath = resolved;
              } catch {
                const imgExts = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'heif'];
                const seg = targetPath.split(/[\\/]/).pop() || '';
                const ext = seg.includes('.') ? seg.split('.').pop()?.toLowerCase() : null;
                if (ext && imgExts.includes(ext)) {
                  const parent = targetPath.substring(0, Math.max(targetPath.lastIndexOf('\\'), targetPath.lastIndexOf('/')));
                  if (parent) targetPath = parent;
                }
              }
              setMultipleFolder(targetPath);
              setTabProgress((prev) => ({ ...prev, multiple: 0 }));
              addLog(`Multiple folder root selected: ${targetPath}`, 'multiple');
            } else if (page === 'copy') {
              let targetPath = dropped[0];
              try {
                const resolved = await invoke('resolve_folder_path', { path: targetPath });
                if (resolved) targetPath = resolved;
              } catch {
                // fallback
              }
              if (!copySource) {
                setCopySource(targetPath);
                addLog(`Source folder selected: ${targetPath}`, 'copy');
              } else if (!copyDestination) {
                setCopyDestination(targetPath);
                addLog(`Destination folder selected: ${targetPath}`, 'copy');
              } else {
                setCopySource(targetPath);
                addLog(`Source folder updated: ${targetPath}`, 'copy');
              }
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
        setTabProgress((prev) => ({ ...prev, file: 0 }));
        addLog(`Selected ${selected.length} image(s)`, 'file');
      }
    } catch (err) {
      addLog(`File pick error: ${err}`, 'file');
    }
  };

  const handlePickSingleFolder = async () => {
    try {
      const folder = await invoke('pick_folder');
      if (folder) {
        setSingleFolder(folder);
        setTabProgress((prev) => ({ ...prev, single: 0 }));
        addLog(`Single folder set: ${folder}`, 'single');
      }
    } catch (err) {
      addLog(`Folder pick error: ${err}`, 'single');
    }
  };

  const handlePickMultipleFolder = async () => {
    try {
      const folder = await invoke('pick_folder');
      if (folder) {
        setMultipleFolder(folder);
        setTabProgress((prev) => ({ ...prev, multiple: 0 }));
        addLog(`Multiple folder root set: ${folder}`, 'multiple');
      }
    } catch (err) {
      addLog(`Folder pick error: ${err}`, 'multiple');
    }
  };

  const handlePickOutputFolder = async () => {
    try {
      const folder = await invoke('pick_folder');
      if (folder) {
        setOutputFolder(folder);
        addLog(`Output folder set: ${folder}`, page);
      }
    } catch (err) {
      addLog(`Folder pick error: ${err}`, page);
    }
  };

  const handlePickCopySource = async () => {
    try {
      const folder = await invoke('pick_folder');
      if (folder) setCopySource(folder);
    } catch (err) {
      addLog(`Source pick error: ${err}`, 'copy');
    }
  };

  const handlePickCopyDestination = async () => {
    try {
      const folder = await invoke('pick_folder');
      if (folder) setCopyDestination(folder);
    } catch (err) {
      addLog(`Destination pick error: ${err}`, 'copy');
    }
  };

  // Execution
  const handleStart = async () => {
    if (busy) return;
    processingTabRef.current = page;

    if (page === 'copy') {
      if (!copySource || !copyDestination) {
        addLog('Error: Choose source and destination folders.', 'copy');
        return;
      }
      const names = folderNames
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      if (names.length === 0) {
        addLog('Error: Enter folder names, one per line.', 'copy');
        return;
      }

      setBusy(true);
      setTabProgress((prev) => ({ ...prev, copy: 0 }));
      try {
        const summary = await invoke('copy_named_folders', {
          names,
          source: copySource,
          destination: copyDestination,
        });
        setTabProgress((prev) => ({ ...prev, copy: 100 }));
        if (summary.outputDir) {
          setTabOutputDir((prev) => ({ ...prev, copy: summary.outputDir }));
        }
        addLog(`Finished: ${summary.completed} copied, ${summary.failed} failed`, 'copy');
      } catch (err) {
        addLog(`Copy error: ${err}`, 'copy');
      } finally {
        setBusy(false);
        setStopping(false);
      }
      return;
    }

    // Compression modes
    const mode = page === 'multiple' ? 'multiplefolders' : page === 'single' ? 'singlefolder' : 'files';
    const currentFolder = page === 'single' ? singleFolder : page === 'multiple' ? multipleFolder : '';
    const input = mode === 'files' ? files : currentFolder ? [currentFolder] : [];

    if (input.length === 0) {
      addLog(page === 'file' ? 'Error: Choose image files.' : 'Error: Choose a source folder.', page);
      return;
    }

    if (customOutput && !outputFolder) {
      addLog('Error: Choose a target output folder or turn off the option.', page);
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
    setTabProgress((prev) => ({ ...prev, [page]: 0 }));
    setTabProcessedItems((prev) => ({ ...prev, [page]: [] }));
    try {
      const summary = await invoke('process_images', {
        input,
        mode,
        root: currentFolder || null,
        options,
      });
      setTabProgress((prev) => ({ ...prev, [page]: 100 }));
      if (summary.items && summary.items.length > 0) {
        setTabProcessedItems((prev) => ({ ...prev, [page]: summary.items }));
      }
      if (summary.outputDir) {
        setTabOutputDir((prev) => ({ ...prev, [page]: summary.outputDir }));
      }
      addLog(`Finished: ${summary.completed} completed, ${summary.failed} failed`, page);
    } catch (err) {
      addLog(`Process error: ${err}`, page);
    } finally {
      setBusy(false);
      setStopping(false);
    }
  };

  const handleStop = async () => {
    if (stopping) return;
    setStopping(true);
    addLog('⏹ Stopping process... finishing current file', processingTabRef.current || page);
    try {
      await invoke('stop_process');
    } catch (err) {
      addLog(`Stop error: ${err}`, processingTabRef.current || page);
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
            : (page === 'single' && singleFolder
                ? `${singleFolder}\\reduced`
                : (page === 'multiple' && multipleFolder
                    ? `${multipleFolder}\\reduced`
                    : (page === 'file' && files.length > 0 && files[0]
                        ? `${files[0].substring(0, Math.max(files[0].lastIndexOf('\\'), files[0].lastIndexOf('/')))}\\reduced`
                        : ''))))
    );

    return (
      <div className="panel activity-panel">
        <div className="activity-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <SolarHistoryIcon width={19} height={19} fill="#0c1f46" />
              <span>Log Aktivitas</span>
            </span>
            {processedItems.length > 0 && (
              <span className="activity-count-badge">
                {processedItems.length} berkas
              </span>
            )}
          </div>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={handleClearLogs}>
            <SolarTrashIcon width={13} height={13} fill="currentColor" />
            <span>Clear</span>
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
                  <th style={{ minWidth: '95px' }} title="Nama berkas asli">File Ori</th>
                  <th style={{ width: '68px', minWidth: '60px', textAlign: 'center' }} title="Format target output">Output</th>
                  <th style={{ width: '75px', minWidth: '70px', textAlign: 'right' }} title="Ukuran berkas asli">Size Ori</th>
                  <th style={{ width: '85px', minWidth: '80px', textAlign: 'right' }} title="Ukuran setelah downscale">Size Akhir</th>
                  <th style={{ width: '90px', minWidth: '85px', textAlign: 'center' }} title="Persentase penurunan & rasio hemat">Hemat</th>
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
                      <td className="cell-output-format" style={{ textAlign: 'center' }} title={`Format output: .${ext}`}>
                        <span className={`ext-tag ${getFormatBadgeClass(ext)}`}>.{ext}</span>
                      </td>
                      <td className="cell-size-orig" style={{ textAlign: 'right' }}>
                        <span className="size-badge-orig">{formatBytes(item.originalSizeBytes)}</span>
                      </td>
                      <td className="cell-size-output" style={{ textAlign: 'right' }}>
                        <span className="size-badge-downscale">{formatBytes(item.outputSizeBytes)}</span>
                      </td>
                      <td className="cell-reduction" style={{ textAlign: 'center' }}>
                        <div className="reduction-cell">
                          <span className={`reduction-pill ${item.reductionPercent >= 0 ? 'pill-positive' : 'pill-negative'}`}>
                            {item.reductionPercent >= 0 ? `↓ ${item.reductionPercent.toFixed(1)}%` : `+${Math.abs(item.reductionPercent).toFixed(1)}%`}
                          </span>
                          {ratio && <span className="reduction-ratio">{ratio}x</span>}
                        </div>
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
              <SolarGalleryWideIcon width={36} height={36} fill="#94a3b8" />
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
                <div className="panel copy-panel">
                  <div className="picker-row">
                    <div className="picker-info">
                      <span className="picker-label">Source folder</span>
                      <span className="picker-path">{copySource || 'Not selected'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {copySource && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '6px 8px', borderColor: '#fecaca', color: '#dc2626' }}
                          onClick={() => setCopySource('')}
                          title="Clear source folder"
                        >
                          <SolarTrashIcon width={12} height={12} fill="#dc2626" />
                        </button>
                      )}
                      <button className="btn-secondary" onClick={handlePickCopySource}>
                        Browse
                      </button>
                    </div>
                  </div>

                  <div className="picker-row">
                    <div className="picker-info">
                      <span className="picker-label">Destination folder</span>
                      <span className="picker-path">{copyDestination || 'Not selected'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {copyDestination && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '6px 8px', borderColor: '#fecaca', color: '#dc2626' }}
                          onClick={() => setCopyDestination('')}
                          title="Clear destination folder"
                        >
                          <SolarTrashIcon width={12} height={12} fill="#dc2626" />
                        </button>
                      )}
                      <button className="btn-secondary" onClick={handlePickCopyDestination}>
                        Browse
                      </button>
                    </div>
                  </div>

                  <div className="field-group copy-input-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="field-label">Folder names</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>1 folder name per line</span>
                        {folderNames && (
                          <button
                            type="button"
                            style={{
                              padding: '2px 7px',
                              fontSize: 11,
                              fontWeight: 600,
                              border: '1px solid #fecaca',
                              borderRadius: 4,
                              background: '#fef2f2',
                              color: '#dc2626',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                            onClick={() => setFolderNames('')}
                          >
                            <SolarTrashIcon width={11} height={11} fill="#dc2626" />
                            <span>Clear</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea
                      className="copy-names-textarea"
                      placeholder="Folder A&#10;Folder B&#10;Folder C..."
                      value={folderNames}
                      onChange={(e) => setFolderNames(e.target.value)}
                    />
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
                    <div
                      className={`dropzone ${isDraggingOver ? 'dragover' : ''}`}
                      onClick={handlePickFiles}
                      onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                      onDragLeave={() => setIsDraggingOver(false)}
                      onDrop={(e) => { e.preventDefault(); setIsDraggingOver(false); }}
                    >
                      <span className="drop-icon">
                        <SolarGallerySendIcon width={38} height={38} fill="#0077ff" />
                      </span>
                      <span className="drop-title">
                        {files.length === 0 ? 'Drop images here or browse' : `${files.length} files selected`}
                      </span>
                      <span className="drop-hint">JPG · PNG · WebP · AVIF · HEIC</span>
                      <button
                        className="btn-secondary"
                        style={{ marginTop: 4 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePickFiles();
                        }}
                      >
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
                              padding: '3px 8px',
                              fontSize: 11,
                              fontWeight: 600,
                              border: '1px solid #fecaca',
                              borderRadius: 4,
                              background: '#fef2f2',
                              color: '#dc2626',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFiles([]);
                              setTabProgress((prev) => ({ ...prev, file: 0 }));
                              addLog('Cleared file queue', 'file');
                            }}
                          >
                            <SolarTrashIcon width={12} height={12} fill="#dc2626" />
                            <span>Clear</span>
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
                ) : page === 'single' ? (
                  <div className="panel" style={{ gap: 12 }}>
                    <div
                      className={`dropzone ${isDraggingOver ? 'dragover' : ''}`}
                      onClick={handlePickSingleFolder}
                      onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                      onDragLeave={() => setIsDraggingOver(false)}
                      onDrop={(e) => { e.preventDefault(); setIsDraggingOver(false); }}
                    >
                      <span className="drop-icon">
                        <SolarAddFolderIcon width={38} height={38} fill="#0077ff" />
                      </span>
                      <span className="drop-title">
                        {!singleFolder ? 'Drop folder here or browse' : (singleFolder.split(/[\\/]/).filter(Boolean).pop() || 'Folder selected')}
                      </span>
                      <span className="drop-hint">Images in folder and subfolders will be processed</span>
                      <button
                        className="btn-secondary"
                        style={{ marginTop: 4 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePickSingleFolder();
                        }}
                      >
                        Browse folder
                      </button>
                    </div>

                    {singleFolder && (
                      <div className="selected-files-list">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-dark)' }}>
                            1 folder ready
                          </span>
                          <button
                            type="button"
                            style={{
                              padding: '3px 8px',
                              fontSize: 11,
                              fontWeight: 600,
                              border: '1px solid #fecaca',
                              borderRadius: 4,
                              background: '#fef2f2',
                              color: '#dc2626',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSingleFolder('');
                              setTabProgress((prev) => ({ ...prev, single: 0 }));
                              addLog('Cleared single folder selection', 'single');
                            }}
                          >
                            <SolarTrashIcon width={12} height={12} fill="#dc2626" />
                            <span>Clear</span>
                          </button>
                        </div>
                        <div
                          className="file-item"
                          style={{
                            wordBreak: 'break-all',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                          title={singleFolder}
                        >
                          <SolarAddFolderIcon width={14} height={14} fill="#085fd1" style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {singleFolder}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : page === 'multiple' ? (
                  <div className="panel" style={{ gap: 12 }}>
                    <div
                      className={`dropzone ${isDraggingOver ? 'dragover' : ''}`}
                      onClick={handlePickMultipleFolder}
                      onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                      onDragLeave={() => setIsDraggingOver(false)}
                      onDrop={(e) => { e.preventDefault(); setIsDraggingOver(false); }}
                    >
                      <span className="drop-icon">
                        <SolarAddFolderIcon width={38} height={38} fill="#0077ff" />
                      </span>
                      <span className="drop-title">
                        {!multipleFolder ? 'Drop folder here or browse' : (multipleFolder.split(/[\\/]/).filter(Boolean).pop() || 'Folder selected')}
                      </span>
                      <span className="drop-hint">Subfolders inside this folder will be batch processed</span>
                      <button
                        className="btn-secondary"
                        style={{ marginTop: 4 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePickMultipleFolder();
                        }}
                      >
                        Browse folder
                      </button>
                    </div>

                    {multipleFolder && (
                      <div className="selected-files-list">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-dark)' }}>
                            1 folder ready
                          </span>
                          <button
                            type="button"
                            style={{
                              padding: '3px 8px',
                              fontSize: 11,
                              fontWeight: 600,
                              border: '1px solid #fecaca',
                              borderRadius: 4,
                              background: '#fef2f2',
                              color: '#dc2626',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMultipleFolder('');
                              setTabProgress((prev) => ({ ...prev, multiple: 0 }));
                              addLog('Cleared multiple folder selection', 'multiple');
                            }}
                          >
                            <SolarTrashIcon width={12} height={12} fill="#dc2626" />
                            <span>Clear</span>
                          </button>
                        </div>
                        <div
                          className="file-item"
                          style={{
                            wordBreak: 'break-all',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                          title={multipleFolder}
                        >
                          <SolarAddFolderIcon width={14} height={14} fill="#085fd1" style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {multipleFolder}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {renderActivityPanel()}
              </div>

              <div className="body-right">
                <div className="panel settings-panel">
                  <span className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <SolarSettingsIcon width={19} height={19} fill="#0c1f46" />
                    <span>Output Settings</span>
                  </span>

                  <div className="field-group">
                    <label className="field-label">Format</label>
                    <div className="format-pills">
                      {[
                        { id: 'png', label: 'PNG' },
                        { id: 'jpeg', label: 'JPEG' },
                        { id: 'webp', label: 'WebP' },
                        { id: 'avif', label: 'AVIF' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`format-btn ${format === item.id ? 'active' : ''}`}
                          onClick={() => setFormat(item.id)}
                        >
                          {item.label}
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
                      {['50', '150', '180', '300'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
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
                      <SolarTuningIcon width={18} height={18} fill="#081434" className="quality-icon" />
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
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}
            >
              <span>{page === 'copy' ? 'START COPY' : 'START'}</span>
              <SolarPlayIcon width={16} height={16} fill="#ffffff" />
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}
