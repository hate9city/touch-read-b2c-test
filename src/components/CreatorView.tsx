import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import WaveSurfer from 'wavesurfer.js';
import * as pdfjsLib from 'pdfjs-dist';

// 热点数据类型定义
interface Hotspot {
  id: string;
  pageNumber: number;
  x: number; // 百分比坐标
  y: number; // 百分比坐标
  width: number; // 百分比尺寸
  height: number; // 百分比尺寸
  audioStart: number; // 音频开始时间（秒）
  audioEnd: number; // 音频结束时间（秒）
  audioFile?: string; // 对应的音频文件
  text?: string; // 可选的文本描述
}

// 书籍数据类型
interface BookData {
  title: string;
  status: string;
  pdf: string;
  hotspots?: Hotspot[];
  audioFile?: string;
}

const CreatorView: React.FC = () => {
  console.log("--- GEMINI WRITE TEST ---");
  const { bookId } = useParams<{ bookId: string }>();
  
  // 基本状态
  const [bookData, setBookData] = useState<BookData | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  
  // 音频相关状态
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null); // 使用useRef来存储WaveSurfer实例
  const [audioRegion, setAudioRegion] = useState<{ id: string; start: number; end: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWaveformReady, setIsWaveformReady] = useState(false);
  const [waveformDuration, setWaveformDuration] = useState(0);
  
  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'start' | 'end' | 'region' | null>(null);
  const [dragStartValue, setDragStartValue] = useState(0);
  
  // 热点编辑状态
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [selectedHotspot, setSelectedHotspot] = useState<string | null>(null);
  const [isCreatingHotspot, setIsCreatingHotspot] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [currentHotspot, setCurrentHotspot] = useState<Partial<Hotspot> | null>(null);
  
  // DOM引用
  const waveformRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const hotspotLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const renderIdRef = useRef(0);
  const isRenderingRef = useRef(false);

  // 获取canvas相对坐标
  const getCanvasCoordinates = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = pdfCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    
    return { x, y };
  };

  // 转换为百分比坐标
  const toPercentageCoords = (x: number, y: number, width?: number, height?: number) => {
    const canvas = pdfCanvasRef.current;
    if (!canvas) return { x: 0, y: 0, width: 0, height: 0 };

    return {
      x: (x / canvas.width) * 100,
      y: (y / canvas.height) * 100,
      width: width ? (width / canvas.width) * 100 : 0,
      height: height ? (height / canvas.height) * 100 : 0
    };
  };

  // 处理canvas鼠标按下事件
  const handleCanvasMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isCreatingHotspot) return;

    const coords = getCanvasCoordinates(event);
    setDragStart(coords);
    setCurrentHotspot({
      id: Date.now().toString(),
      pageNumber: currentPage,
      x: 0, y: 0, width: 0, height: 0,
      audioStart: audioRegion?.start || 0,
      audioEnd: audioRegion?.end || 0
    });
  };

  // 处理canvas鼠标移动事件
  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isCreatingHotspot || !dragStart || !currentHotspot) return;

    const coords = getCanvasCoordinates(event);
    const x = Math.min(dragStart.x, coords.x);
    const y = Math.min(dragStart.y, coords.y);
    const width = Math.abs(coords.x - dragStart.x);
    const height = Math.abs(coords.y - dragStart.y);

    const percentCoords = toPercentageCoords(x, y, width, height);
    setCurrentHotspot(prev => prev ? { ...prev, ...percentCoords } : null);
  };

  // 处理canvas鼠标抬起事件
  const handleCanvasMouseUp = () => {
    if (!isCreatingHotspot || !dragStart || !currentHotspot) return;

    // 只有当热点足够大时才创建
    if (currentHotspot.width! > 2 && currentHotspot.height! > 2) {
      const newHotspot: Hotspot = {
        ...(currentHotspot as Hotspot),
        audioFile: audioFile?.name || bookData?.audioFile || ''
      };
      setHotspots(prev => [...prev, newHotspot]);
    }

    // 重置状态
    setDragStart(null);
    setCurrentHotspot(null);
    setIsCreatingHotspot(false);
  };

  // 删除热点
  const deleteHotspot = (hotspotId: string) => {
    setHotspots(prev => prev.filter(h => h.id !== hotspotId));
    if (selectedHotspot === hotspotId) {
      setSelectedHotspot(null);
    }
  };

  // 获取当前页面的热点
  const getCurrentPageHotspots = () => {
    return hotspots.filter(h => h.pageNumber === currentPage);
  };

  // 加载书籍数据和PDF
  useEffect(() => {
    const loadBookData = async () => {
      if (!bookId) return;

      try {
        // 1. 从 public/books 目录加载书籍的 JSON 数据
        const bookJsonResponse = await fetch(`/books/${bookId}`);
        if (!bookJsonResponse.ok) {
          throw new Error(`无法加载书籍配置文件: ${bookJsonResponse.statusText}`);
        }
        const data = await bookJsonResponse.json() as BookData;
        setBookData(data);
        setHotspots(data.hotspots || []);

        // 2. 加载 PDF 文件
        if (data.pdf) {
          const pdfResponse = await fetch(`/books/${data.pdf}`);
          if (!pdfResponse.ok) {
            throw new Error(`无法加载 PDF 文件: ${pdfResponse.statusText}`);
          }
          const pdfData = await pdfResponse.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
          setPdfDoc(pdf);
          setNumPages(pdf.numPages);
        }

        // 3. 加载音频文件
        if (data.audioFile) {
          try {
            const audioResponse = await fetch(`/books/${encodeURIComponent(data.audioFile)}`);
            if (audioResponse.ok) {
              const audioBlob = await audioResponse.blob();
              const audioFile = new File([audioBlob], data.audioFile, { type: audioBlob.type });
              // 使用 setTimeout 延迟设置，模仿手动上传的成功逻辑，以避免潜在的竞态条件
              setTimeout(() => setAudioFile(audioFile), 100);
            } else {
              console.warn(`音频文件 "${data.audioFile}" 未找到（状态: ${audioResponse.status}），用户可以上传新的文件。`);
            }
          } catch (e) {
            console.error(`加载音频文件 "${data.audioFile}" 时发生网络错误:`, e);
          }
        }
      } catch (err) {
        console.error('加载书籍数据时出错:', err);
        setError(`加载书籍数据失败: ${(err as Error).message}`);
      }
    };

    loadBookData();
  }, [bookId]);

  // 渲染PDF页面
  const renderPdfPage = useCallback(async (pageNumber: number) => {
    if (!pdfDoc || !pdfCanvasRef.current) return;

    const canvas = pdfCanvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    // 防止多重渲染的机制
    if (isRenderingRef.current && renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch (e) {
        // 忽略取消错误
      }
      renderTaskRef.current = null;
    }

    const currentRenderId = ++renderIdRef.current;
    isRenderingRef.current = true;

    try {
      const page = await pdfDoc.getPage(pageNumber);
      
      // 检查是否还是当前的渲染任务
      if (currentRenderId !== renderIdRef.current) {
        return;
      }

      const viewport = page.getViewport({ scale: 1.5 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.style.width = '100%';
      canvas.style.height = 'auto';

      // 清空canvas
      context.clearRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      renderTaskRef.current = page.render(renderContext as any);
      await renderTaskRef.current.promise;
      
      // 最后检查是否还是当前的渲染任务
      if (currentRenderId === renderIdRef.current) {
        renderTaskRef.current = null;
        isRenderingRef.current = false;
      }
    } catch (err: any) {
      if (err.name !== 'RenderingCancelledException') {
        console.error('Error rendering PDF page:', err);
      }
      renderTaskRef.current = null;
      isRenderingRef.current = false;
    }
  }, [pdfDoc]);

  // 全局鼠标事件处理
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !waveformRef.current || !audioRegion || !dragType) return;

      const waveformElement = waveformRef.current.querySelector('div');
      if (!waveformElement) return;

      const rect = waveformElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const time = (percent / 100) * waveformDuration;

      if (dragType === 'start') {
        const newStart = Math.max(0, Math.min(time, audioRegion.end - 0.1));
        if (newStart !== audioRegion.start) {
          setAudioRegion({
            ...audioRegion,
            start: newStart
          });
        }
      } else if (dragType === 'end') {
        const newEnd = Math.min(waveformDuration, Math.max(time, audioRegion.start + 0.1));
        if (newEnd !== audioRegion.end) {
          setAudioRegion({
            ...audioRegion,
            end: newEnd
          });
        }
      } else if (dragType === 'region') {
        const deltaTime = time - dragStartValue;
        const regionDuration = audioRegion.end - audioRegion.start;
        let newStart = audioRegion.start + deltaTime;
        let newEnd = audioRegion.end + deltaTime;

        // 确保选区不超出边界
        if (newStart < 0) {
          newStart = 0;
          newEnd = regionDuration;
        } else if (newEnd > waveformDuration) {
          newEnd = waveformDuration;
          newStart = waveformDuration - regionDuration;
        }

        setAudioRegion({
          ...audioRegion,
          start: newStart,
          end: newEnd
        });
        setDragStartValue(time);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragType(null);
      setDragStartValue(0);
      document.body.style.cursor = '';
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // 设置全局光标样式
      if (dragType === 'start' || dragType === 'end') {
        document.body.style.cursor = 'col-resize';
      } else if (dragType === 'region') {
        document.body.style.cursor = 'grab';
      }

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
      };
    }
  }, [isDragging, dragType, audioRegion, waveformDuration, dragStartValue]);

  // 当前页面改变时重新渲染
  useEffect(() => {
    if (currentPage > 0) {
      renderPdfPage(currentPage);
    }
  }, [currentPage, renderPdfPage]);

  // 初始化WaveSurfer
  useEffect(() => {
    if (!audioFile || !waveformRef.current) {
      return;
    }

    const container = waveformRef.current;

    console.log('Initializing WaveSurfer...');
    
    const ws = WaveSurfer.create({
      container,
      waveColor: '#4a90e2',
      progressColor: '#2c5aa0',
      cursorColor: '#ff6b35',
      barWidth: 2,
      barGap: 1,
      barRadius: 3,
      height: 100,
      normalize: true,
      backend: 'WebAudio',
      mediaControls: false,
      interact: true,
      fillParent: true,
    });

    wavesurfer.current = ws;

    ws.on('ready', () => {
      if (wavesurfer.current === ws) {
        console.log('WaveSurfer is ready for the current audio file.');
        setIsWaveformReady(true);
        setWaveformDuration(ws.getDuration());
      }
    });

    ws.on('play', () => {
      if (wavesurfer.current === ws) setIsPlaying(true);
    });
    ws.on('pause', () => {
      if (wavesurfer.current === ws) setIsPlaying(false);
    });
    ws.on('finish', () => {
      if (wavesurfer.current === ws) setIsPlaying(false);
    });

    ws.on('error', (error) => {
      // React's StrictMode in development can cause a harmless AbortError when the component is quickly unmounted and remounted.
      // We can safely ignore this error.
      if (error.name === 'AbortError') {
        console.warn('WaveSurfer load was aborted. This is often normal in development due to React Strict Mode.');
        return;
      }
      if (wavesurfer.current === ws) {
        console.error('WaveSurfer error:', error);
        setError(`音频加载错误: ${error.toString()}`);
      }
    });

    ws.load(URL.createObjectURL(audioFile)).catch((error) => {
      // 只有当错误不是预期的 AbortError 时，才将其视为问题
      if (error.name !== 'AbortError') {
        console.error('Unhandled error on ws.load:', error);
      }
    });

    // 清理函数
    return () => {
      ws.destroy();
    };
  }, [audioFile]);

  // 清理PDF渲染任务
  useEffect(() => {
    return () => {
      // 清理PDF渲染任务
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // 忽略取消错误
        }
        renderTaskRef.current = null;
      }
      isRenderingRef.current = false;
    };
  }, []);

  // 音频播放控制
  const handlePlayPause = () => {
    if (wavesurfer.current) {
      wavesurfer.current.playPause();
    }
  };

  // 试听选区
  const handlePlayRegion = () => {
    if (wavesurfer.current && audioRegion) {
      wavesurfer.current.play(audioRegion.start, audioRegion.end);
    }
  };

  // 创建音频选区 - 使用React状态管理
  const handleCreateRegion = () => {
    const ws = wavesurfer.current;
    if (!ws || !isWaveformReady) {
      console.log('WaveSurfer not ready');
      return;
    }

    try {
      // 获取当前播放位置和总时长
      const currentTime = ws.getCurrentTime();
      const duration = ws.getDuration();
      
      // 创建一个3秒的选区（从当前位置开始）
      const startTime = Math.max(0, currentTime);
      const endTime = Math.min(duration, currentTime + 3);

      // 更新选区状态
      const regionId = `region-${Date.now()}`;
      setAudioRegion({
        id: regionId,
        start: startTime,
        end: endTime
      });

      console.log('Region created:', startTime, endTime);
      
    } catch (error) {
      console.error('Error creating region:', error);
      setError(`创建选区失败: ${error}`);
    }
  };

  // 开始拖拽处理函数
  const handleDragStart = (e: React.MouseEvent, type: 'start' | 'end' | 'region') => {
    e.preventDefault();
    e.stopPropagation();

    if (!waveformRef.current || !audioRegion) return;

    const waveformElement = waveformRef.current.querySelector('div');
    if (!waveformElement) return;

    const rect = waveformElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = (x / rect.width) * 100;
    const time = (percent / 100) * waveformDuration;

    setIsDragging(true);
    setDragType(type);
    setDragStartValue(time);
  };

  // React组件方式的音频选区可视化
  const AudioRegionOverlay = () => {
    if (!audioRegion || !isWaveformReady || waveformDuration === 0) {
      return null;
    }

    const startPercent = (audioRegion.start / waveformDuration) * 100;
    const endPercent = (audioRegion.end / waveformDuration) * 100;
    const widthPercent = endPercent - startPercent;

    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: `${startPercent}%`,
          width: `${widthPercent}%`,
          height: '100%',
          backgroundColor: 'rgba(0, 123, 255, 0.3)',
          border: '2px solid #007bff',
          pointerEvents: 'auto',
          zIndex: 2,
          borderRadius: '2px',
          cursor: isDragging && dragType === 'region' ? 'grabbing' : 'grab'
        }}
        onMouseDown={(e) => handleDragStart(e, 'region')}
        title={`音频选区: ${audioRegion.start.toFixed(1)}s - ${audioRegion.end.toFixed(1)}s`}
      >
        {/* 开始时间标签 */}
        <div
          style={{
            position: 'absolute',
            top: '-20px',
            left: '0',
            fontSize: '10px',
            color: '#007bff',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            pointerEvents: 'none'
          }}
        >
          {audioRegion.start.toFixed(1)}s
        </div>
        
        {/* 结束时间标签 */}
        <div
          style={{
            position: 'absolute',
            top: '-20px',
            right: '0',
            fontSize: '10px',
            color: '#007bff',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            pointerEvents: 'none'
          }}
        >
          {audioRegion.end.toFixed(1)}s
        </div>
        
        {/* 左侧手柄 */}
        <div
          style={{
            position: 'absolute',
            left: '-5px', // 调整位置以使手柄居中
            top: '0',
            width: '10px', // 增加可点击区域
            height: '100%',
            backgroundColor: 'rgba(0, 123, 255, 0.2)', // 半透明背景
            borderLeft: '2px solid #0056b3', // 可见的线条
            cursor: 'col-resize',
            pointerEvents: 'auto',
            borderRadius: '2px'
          }}
          onMouseDown={(e) => handleDragStart(e, 'start')}
          title="拖拽调整开始时间"
        />
        
        {/* 右侧手柄 */}
        <div
          style={{
            position: 'absolute',
            right: '-5px', // 调整位置以使手柄居中
            top: '0',
            width: '10px', // 增加可点击区域
            height: '100%',
            backgroundColor: 'rgba(0, 123, 255, 0.2)', // 半透明背景
            borderRight: '2px solid #0056b3', // 可见的线条
            cursor: 'col-resize',
            pointerEvents: 'auto',
            borderRadius: '2px'
          }}
          onMouseDown={(e) => handleDragStart(e, 'end')}
          title="拖拽调整结束时间"
        />
      </div>
    );
  };

  // 更新选区时间
  const updateRegionTime = (field: 'start' | 'end', value: number) => {
    const ws = wavesurfer.current;
    if (!audioRegion || !ws || !isWaveformReady) return;
    
    const duration = ws.getDuration();
    const newValue = Math.max(0, Math.min(duration, value));
    
    try {
      let newAudioRegion;
      if (field === 'start') {
        const newStart = Math.min(newValue, audioRegion.end - 0.1);
        newAudioRegion = { 
          id: audioRegion.id,
          start: newStart, 
          end: audioRegion.end 
        };
      } else {
        const newEnd = Math.max(newValue, audioRegion.start + 0.1);
        newAudioRegion = { 
          id: audioRegion.id,
          start: audioRegion.start, 
          end: newEnd
        };
      }
      
      setAudioRegion(newAudioRegion);
      
    } catch (error) {
      console.error('Error updating region:', error);
    }
  };

  // 音频文件上传处理
  const handleAudioUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      console.log('New audio file selected:', file.name);
      
      // 重置相关状态
      setAudioRegion(null);
      setIsPlaying(false);
      setIsWaveformReady(false);
      setWaveformDuration(0);
      setError(null);
      
      // 设置新的音频文件，这将触发useEffect来创建新的WaveSurfer实例
      setAudioFile(file);
      
      // 清空input以允许重新选择相同文件
      event.target.value = '';
    } else {
      setError('请选择有效的音频文件');
    }
  };

  // 保存书籍数据（下载为文件）
  const saveBookData = () => {
    if (!bookData || !bookId) return;

    // 确保每个热点都有正确的 audioFile 属性
    const updatedHotspots = hotspots.map(h => ({
      ...h,
      audioFile: h.audioFile || audioFile?.name || bookData.audioFile || ''
    }));

    const updatedData = {
      ...bookData,
      hotspots: updatedHotspots,
      audioFile: audioFile?.name || bookData.audioFile,
    };

    const jsonContent = JSON.stringify(updatedData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = bookId; // 使用 bookId (例如, sample-book.json) 作为文件名
    document.body.appendChild(link);
    link.click();

    // 清理
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    alert('文件已生成并开始下载！');
  };

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>制作器</h2>
        <p style={{ color: 'red' }}>{error}</p>
        <Link to="/">返回书架</Link>
      </div>
    );
  }

  if (!bookData || !pdfDoc) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>制作器</h2>
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* 头部工具栏 */}
      <div style={{ 
        padding: '1rem', 
        backgroundColor: 'white', 
        borderBottom: '1px solid #ddd',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <Link to="/" style={{ marginRight: '1rem' }}>← 返回书架</Link>
          <Link to={`/read/${bookId}`} style={{ marginRight: '1rem' }}>预览阅读</Link>
          <span>制作：{bookData.title}</span>
        </div>
        <div>
          <button onClick={saveBookData} style={{ 
            padding: '0.5rem 1rem', 
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: 'pointer'
          }}>
            保存
          </button>
        </div>
      </div>

      {/* NEW: Top row for Audio Editor */}
      <div style={{ 
        backgroundColor: 'white',
        padding: '1rem',
        borderBottom: '1px solid #ddd'
      }}>
        <h3>音频编辑器</h3>
        {!audioFile ? (
          <div>
            <label htmlFor="audio-upload" style={{ 
              display: 'block', 
              padding: '2rem',
              border: '2px dashed #ddd',
              borderRadius: '8px',
              textAlign: 'center',
              cursor: 'pointer'
            }}>
              点击上传音频文件
              <input 
                id="audio-upload"
                type="file" 
                accept="audio/*" 
                onChange={handleAudioUpload}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span>音频文件: {audioFile.name}</span>
              <label htmlFor="audio-reupload" style={{ 
                padding: '0.25rem 0.5rem',
                backgroundColor: '#6c757d',
                color: 'white',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8em'
              }}>
                更换文件
                <input 
                  id="audio-reupload"
                  type="file" 
                  accept="audio/*" 
                  onChange={handleAudioUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
            
            <div style={{ 
              position: 'relative',
              width: '100%', 
              height: '100px',
              marginBottom: '1rem'
            }}>
              <div ref={waveformRef} style={{ 
                width: '100%', 
                height: '100%',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: '#f9f9f9'
              }}>
                {/* This div is now managed by WaveSurfer */}
              </div>
              {!isWaveformReady && audioFile && (
                <div style={{ 
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255,255,255,0.8)',
                  zIndex: 10
                }}>
                  <span>加载波形中...</span>
                </div>
              )}
              <AudioRegionOverlay />
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button 
                onClick={handlePlayPause}
                disabled={!isWaveformReady}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: !isWaveformReady ? '#6c757d' : (isPlaying ? '#dc3545' : '#28a745'),
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: !isWaveformReady ? 'not-allowed' : 'pointer'
                }}
              >
                {isPlaying ? '暂停' : '播放'}
              </button>
              <button 
                onClick={handleCreateRegion}
                disabled={!isWaveformReady}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: !isWaveformReady ? '#6c757d' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: !isWaveformReady ? 'not-allowed' : 'pointer'
                }}
                title={!isWaveformReady ? '请等待音频加载完成' : '在波形上创建可拖拽的音频选区'}
              >
                创建选区
              </button>
              <button 
                onClick={handlePlayRegion}
                disabled={!audioRegion || !isWaveformReady}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: (!audioRegion || !isWaveformReady) ? '#6c757d' : '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (!audioRegion || !isWaveformReady) ? 'not-allowed' : 'pointer'
                }}
              >
                试听选区
              </button>
            </div>
            
            {audioRegion && (
              <div style={{ 
                padding: '0.75rem',
                backgroundColor: '#f8f9fa',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                fontSize: '0.9em'
              }}>
                <div style={{ marginBottom: '0.5rem' }}><strong>选区编辑:</strong></div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label>开始:</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max={wavesurfer.current?.getDuration() || 0}
                      value={audioRegion.start.toFixed(1)}
                      onChange={(e) => updateRegionTime('start', parseFloat(e.target.value))}
                      style={{ width: '70px', padding: '0.25rem', border: '1px solid #ddd', borderRadius: '3px' }}
                    />
                    <span>秒</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label>结束:</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max={wavesurfer.current?.getDuration() || 0}
                      value={audioRegion.end.toFixed(1)}
                      onChange={(e) => updateRegionTime('end', parseFloat(e.target.value))}
                      style={{ width: '70px', padding: '0.25rem', border: '1px solid #ddd', borderRadius: '3px' }}
                    />
                    <span>秒</span>
                  </div>
                </div>
                <div style={{ fontSize: '0.8em', color: '#666' }}>
                  时长: {(audioRegion.end - audioRegion.start).toFixed(2)}秒
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* NEW: Bottom row for PDF and Hotspot List */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Column: PDF Viewer */}
        <div style={{ 
          flex: '1 1 60%', 
          display: 'flex', 
          flexDirection: 'column',
          backgroundColor: 'white',
          margin: '1rem',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          <div style={{ 
            padding: '1rem', 
            borderBottom: '1px solid #eee',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <button 
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              style={{ marginRight: '1rem' }}
            >
              上一页
            </button>
            <span>第 {currentPage} / {numPages} 页</span>
            <button 
              onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
              disabled={currentPage >= numPages}
              style={{ marginLeft: '1rem' }}
            >
              下一页
            </button>
          </div>

          <div style={{ 
            flex: 1, 
            padding: '1rem',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            overflow: 'auto',
            position: 'relative'
          }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <canvas 
                ref={pdfCanvasRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                style={{ 
                  maxWidth: '100%',
                  maxHeight: '100%',
                  border: '1px solid #ddd',
                  cursor: isCreatingHotspot ? 'crosshair' : 'default',
                  display: 'block'
                }}
              />
              <div 
                ref={hotspotLayerRef}
                style={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: 0, 
                  width: '100%', 
                  height: '100%',
                  pointerEvents: 'none'
                }}
              >
                {getCurrentPageHotspots().map(hotspot => (
                  <div
                    key={hotspot.id}
                    style={{
                      position: 'absolute',
                      left: `${hotspot.x}%`,
                      top: `${hotspot.y}%`,
                      width: `${hotspot.width}%`,
                      height: `${hotspot.height}%`,
                      border: selectedHotspot === hotspot.id ? '3px solid #007bff' : '2px solid #ff6b35',
                      backgroundColor: 'rgba(255, 107, 53, 0.3)',
                      pointerEvents: 'auto',
                      cursor: 'pointer'
                    }}
                    onClick={() => setSelectedHotspot(hotspot.id)}
                  >
                    <div style={{
                      position: 'absolute',
                      top: '-25px',
                      left: '0',
                      backgroundColor: '#ff6b35',
                      color: 'white',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontSize: '10px',
                      whiteSpace: 'nowrap'
                    }}>
                      {hotspot.audioStart.toFixed(1)}s-{hotspot.audioEnd.toFixed(1)}s
                    </div>
                  </div>
                ))}
                {currentHotspot && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${currentHotspot.x}%`,
                      top: `${currentHotspot.y}%`,
                      width: `${currentHotspot.width}%`,
                      height: `${currentHotspot.height}%`,
                      border: '2px dashed #007bff',
                      backgroundColor: 'rgba(0, 123, 255, 0.2)',
                      pointerEvents: 'none'
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Hotspot List */}
        <div style={{ 
          flex: '1 1 40%', 
          display: 'flex', 
          flexDirection: 'column',
          gap: '1rem',
          padding: '1rem'
        }}>
          <div style={{ 
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '1rem',
            flex: 1,
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>热点列表 ({hotspots.length})</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  onClick={() => setIsCreatingHotspot(!isCreatingHotspot)}
                  disabled={!audioRegion}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: !audioRegion ? '#6c757d' : (isCreatingHotspot ? '#dc3545' : '#28a745'),
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: !audioRegion ? 'not-allowed' : 'pointer',
                    fontSize: '0.9em'
                  }}
                  title={!audioRegion ? '请先在音频编辑器中创建选区' : ''}
                >
                  {isCreatingHotspot ? '取消创建' : '创建热点'}
                </button>
              </div>
            </div>
            {!audioRegion && (
              <div style={{ 
                padding: '0.75rem',
                backgroundColor: '#fff3cd',
                border: '1px solid #ffeaa7',
                borderRadius: '4px',
                marginBottom: '1rem',
                fontSize: '0.9em',
                color: '#856404'
              }}>
                💡 提示：请先在音频编辑器中创建音频选区，然后再创建热点
              </div>
            )}
            {hotspots.length === 0 ? (
              <p style={{ color: '#666', textAlign: 'center' }}>
                暂无热点，选择音频片段后点击"创建热点"开始制作
              </p>
            ) : (
              <div>
                {hotspots.map((hotspot) => (
                  <div 
                    key={hotspot.id}
                    style={{
                      padding: '0.75rem',
                      border: selectedHotspot === hotspot.id ? '2px solid #007bff' : '1px solid #ddd',
                      borderRadius: '6px',
                      marginBottom: '0.75rem',
                      cursor: 'pointer',
                      backgroundColor: selectedHotspot === hotspot.id ? '#f8f9ff' : 'white'
                    }}
                    onClick={() => setSelectedHotspot(hotspot.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                          第 {hotspot.pageNumber} 页热点
                        </div>
                        <div style={{ fontSize: '0.9em', color: '#666', marginBottom: '0.25rem' }}>
                          音频: {hotspot.audioStart.toFixed(1)}s - {hotspot.audioEnd.toFixed(1)}s
                          （时长: {(hotspot.audioEnd - hotspot.audioStart).toFixed(1)}s）
                        </div>
                        <div style={{ fontSize: '0.8em', color: '#999' }}>
                          位置: ({hotspot.x.toFixed(1)}%, {hotspot.y.toFixed(1)}%) 
                          尺寸: {hotspot.width.toFixed(1)}% × {hotspot.height.toFixed(1)}%
                        </div>
                        {hotspot.text && (
                          <div style={{ fontSize: '0.9em', color: '#333', marginTop: '0.25rem', fontStyle: 'italic' }}>
                            "{hotspot.text}"
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.5rem' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (wavesurfer.current) {
                              wavesurfer.current.play(hotspot.audioStart, hotspot.audioEnd);
                            }
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#17a2b8',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '0.8em'
                          }}
                          title="试听这个热点的音频"
                        >
                          🎵
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('确定要删除这个热点吗？')) {
                              deleteHotspot(hotspot.id);
                            }
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '0.8em'
                          }}
                          title="删除热点"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatorView;