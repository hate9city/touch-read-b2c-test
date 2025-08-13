import React, { useEffect, useState, useRef, useCallback, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { Howl } from 'howler';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const PdfPage = ({ pdf, pageNumber, width, height, shouldRender = true, hotspots, onHotspotClick, currentHotspot, isRepeatMode, repeatStartHotspot, repeatEndHotspot, isRepeating }: { 
    pdf: pdfjsLib.PDFDocumentProxy, 
    pageNumber: number, 
    width: number, 
    height: number, 
    shouldRender?: boolean,
    hotspots?: any[],
    onHotspotClick?: (hotspot: any, event: React.MouseEvent) => void,
    currentHotspot?: any,
    isRepeatMode?: boolean,
    repeatStartHotspot?: any,
    repeatEndHotspot?: any,
    isRepeating?: boolean
}) => { 
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
    const isRenderingRef = useRef(false);
    const renderIdRef = useRef(0);
    const [isRendered, setIsRendered] = useState(false);

    useEffect(() => {
        if (!shouldRender || !pdf) {
            return;
        }
        
        let renderTask: pdfjsLib.RenderTask | null = null;

        const render = async () => {
            const canvas = canvasRef.current;
            if (!canvas || width <= 0 || height <= 0) return;

            try {
                const page = await pdf.getPage(pageNumber);
                const dpr = window.devicePixelRatio || 1;
                const viewport = page.getViewport({ scale: 1 });
                const scale = Math.min(width / viewport.width, height / viewport.height);
                
                const cssWidth = viewport.width * scale;
                const cssHeight = viewport.height * scale;

                if (canvas.width !== Math.floor(cssWidth * dpr) || canvas.height !== Math.floor(cssHeight * dpr)) {
                    canvas.style.width = `${cssWidth}px`;
                    canvas.style.height = `${cssHeight}px`;
                    canvas.width = Math.floor(cssWidth * dpr);
                    canvas.height = Math.floor(cssHeight * dpr);
                }

                const context = canvas.getContext('2d');
                if (!context) return;

                const renderViewport = page.getViewport({ scale: scale * dpr });
                renderTask = page.render({ canvasContext: context, viewport: renderViewport });
                
                await renderTask.promise;
                setIsRendered(true);
            } catch (e: any) {
                if (e.name !== 'RenderingCancelledException') {
                    console.error(`Render error on page ${pageNumber}:`, e);
                }
            }
        };
        
        render();

        return () => {
            renderTask?.cancel();
        };
    }, [pdf, pageNumber, width, height, shouldRender]);

    return (
        <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', width, height }}>
            <canvas 
                ref={canvasRef} 
                style={{ 
                    display: 'block',
                    backgroundColor: shouldRender && !isRendered ? '#f5f5f5' : 'transparent',
                    opacity: (isRepeatMode && !isRepeating) && shouldRender ? 0.7 : 1,
                    transition: 'opacity 0.3s ease'
                }} 
            />
            {isRendered && hotspots && hotspots
                .filter(hotspot => hotspot.pageNumber === pageNumber)
                .map(hotspot => {
                    const canvas = canvasRef.current;
                    if (!canvas) return null;
                    
                    const canvasStyle = getComputedStyle(canvas);
                    const actualWidth = parseFloat(canvasStyle.width);
                    const actualHeight = parseFloat(canvasStyle.height);
                    
                    const isCurrentPlaying = currentHotspot && currentHotspot.id === hotspot.id;
                    const isRepeatStart = repeatStartHotspot && repeatStartHotspot.id === hotspot.id;
                    const isRepeatEnd = repeatEndHotspot && repeatEndHotspot.id === hotspot.id;
                    
                    let borderColor = 'rgba(255, 107, 53, 0.8)';
                    let backgroundColor = 'rgba(255, 107, 53, 0.2)';
                    let borderWidth = '2px';
                    
                    if (isRepeatMode) {
                        if (isRepeatStart) {
                            borderColor = '#00ff00';
                            backgroundColor = 'rgba(0, 255, 0, 0.3)';
                            borderWidth = '3px';
                        } else if (isRepeatEnd) {
                            borderColor = '#ff0000';
                            backgroundColor = 'rgba(255, 0, 0, 0.3)';
                            borderWidth = '3px';
                        } else {
                            backgroundColor = 'rgba(255, 107, 53, 0.4)';
                        }
                    } else if (isCurrentPlaying) {
                        borderColor = '#ff6b35';
                        backgroundColor = 'rgba(255, 107, 53, 0.4)';
                        borderWidth = '3px';
                    }
                    
                    return (
                        <div
                            key={hotspot.id}
                            onClick={(e) => onHotspotClick?.(hotspot, e)}
                            style={{
                                position: 'absolute',
                                left: `${(hotspot.x / 100) * actualWidth}px`,
                                top: `${(hotspot.y / 100) * actualHeight}px`,
                                width: `${(hotspot.width / 100) * actualWidth}px`,
                                height: `${(hotspot.height / 100) * actualHeight}px`,
                                border: `${borderWidth} solid ${borderColor}`,
                                backgroundColor: backgroundColor,
                                cursor: 'pointer',
                                zIndex: 20,
                                pointerEvents: 'auto',
                                transition: 'all 0.2s ease',
                                animation: isCurrentPlaying ? 'pulse 1s infinite' : 'none'
                            }}
                            title={
                                isRepeatStart ? `✅ 起始点: ${hotspot.audioStart?.toFixed(2)}s - ${hotspot.audioEnd?.toFixed(2)}s` :
                                isRepeatEnd ? `✅ 结束点: ${hotspot.audioStart?.toFixed(2)}s - ${hotspot.audioEnd?.toFixed(2)}s` :
                                isRepeatMode ? `点击选择: ${hotspot.audioStart?.toFixed(2)}s - ${hotspot.audioEnd?.toFixed(2)}s` :
                                `音频: ${hotspot.audioStart?.toFixed(2)}s - ${hotspot.audioEnd?.toFixed(2)}s${isCurrentPlaying ? ' (播放中)' : ''}`
                            }
                        />
                    );
                })
            }
        </div>
    );
};

const SinglePageViewer = ({ pdf, currentPage, onPageChange, hotspots, onHotspotClick, currentHotspot, isRepeatMode, repeatStartHotspot, repeatEndHotspot, isRepeating }: { 
    pdf: pdfjsLib.PDFDocumentProxy, 
    currentPage: number, 
    onPageChange: (page: number) => void,
    hotspots?: any[],
    onHotspotClick?: (hotspot: any, event: React.MouseEvent) => void,
    currentHotspot?: any,
    isRepeatMode?: boolean,
    repeatStartHotspot?: any,
    repeatEndHotspot?: any,
    isRepeating?: boolean
}) => {
    const [pageSize, setPageSize] = useState({ width: 1, height: 1 });
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [displayPage, setDisplayPage] = useState(currentPage);
    const containerRef = useRef<HTMLDivElement>(null);
    const touchStartRef = useRef<{ x: number } | null>(null);

    const calculateSize = useCallback(async () => {
        if (!pdf || !containerRef.current) return;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const pageRatio = viewport.height / viewport.width;
        
        const availableHeight = containerRef.current.clientHeight - 20;
        const availableWidth = containerRef.current.clientWidth - 20;
        
        let singlePageHeight = availableHeight;
        let singlePageWidth = singlePageHeight / pageRatio;
        if (singlePageWidth > availableWidth) {
            singlePageWidth = availableWidth;
            singlePageHeight = singlePageWidth * pageRatio;
        }
        setPageSize({ width: singlePageWidth, height: singlePageHeight });
    }, [pdf]);

    useLayoutEffect(() => {
        calculateSize();
        window.addEventListener('resize', calculateSize);
        return () => window.removeEventListener('resize', calculateSize);
    }, [calculateSize]);

    useEffect(() => {
        if (currentPage !== displayPage) {
            setIsTransitioning(true);
            const timer = setTimeout(() => {
                setDisplayPage(currentPage);
                setIsTransitioning(false);
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [currentPage, displayPage]);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            touchStartRef.current = { x: e.touches[0].clientX };
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartRef.current && e.changedTouches.length === 1) {
            const endX = e.changedTouches[0].clientX;
            const deltaX = endX - touchStartRef.current.x;
            const swipeThreshold = 50;

            if (deltaX > swipeThreshold) {
                if (currentPage > 0) {
                    onPageChange(currentPage - 1);
                }
            } else if (deltaX < -swipeThreshold) {
                if (pdf && currentPage < pdf.numPages - 1) {
                    onPageChange(currentPage + 1);
                }
            }
        }
        touchStartRef.current = null;
    };

    return (
        <div 
            ref={containerRef} 
            style={{ 
                position: 'absolute', 
                width: '100%', 
                height: '100%', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                padding: '0',
                userSelect: 'none'
            }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {pageSize.width > 1 && (
                 <div style={{ 
                    position: 'relative', 
                    width: pageSize.width, 
                    height: pageSize.height,
                    transition: isTransitioning ? 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out' : 'none',
                    opacity: isTransitioning ? 0.7 : 1,
                    transform: isTransitioning ? 'scale(0.98)' : 'scale(1)'
                 }}>
                    <PdfPage 
                        pdf={pdf} 
                        pageNumber={displayPage + 1} 
                        width={pageSize.width} 
                        height={pageSize.height} 
                        shouldRender={true} 
                        hotspots={hotspots}
                        onHotspotClick={onHotspotClick}
                        currentHotspot={currentHotspot}
                        isRepeatMode={isRepeatMode}
                        repeatStartHotspot={repeatStartHotspot}
                        repeatEndHotspot={repeatEndHotspot}
                        isRepeating={isRepeating}
                    />
                </div>
            )}
        </div>
    );
};

const ReaderView: React.FC = () => { 
    const { bookId } = useParams<{ bookId: string }>();
    const navigate = useNavigate();
    const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [numPages, setNumPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(0);
    const [viewMode, setViewMode] = useState('portrait');
    const [error, setError] = useState<string | null>(null);
    const [bookData, setBookData] = useState<any>(null);
    const [howlInstances, setHowlInstances] = useState<{ [key: string]: Howl }>({});
    const [audioFiles, setAudioFiles] = useState<{ [key: string]: File }>({});
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentHotspot, setCurrentHotspot] = useState<any>(null);
    const [audioQueue, setAudioQueue] = useState<any[]>([]);
    const [isRepeatMode, setIsRepeatMode] = useState(false);
    const [repeatStartHotspot, setRepeatStartHotspot] = useState<any>(null);
    const [repeatEndHotspot, setRepeatEndHotspot] = useState<any>(null);
    const [isRepeating, setIsRepeating] = useState(false);
    const [repeatPaused, setRepeatPaused] = useState(false);
    const [isTocOpen, setIsTocOpen] = useState(false);
    const controlsRef = useRef<HTMLDivElement>(null);
    const currentTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const repeatHowlRef = useRef<Howl | null>(null);

    const isRepeatingRef = useRef(isRepeating);
    useEffect(() => {
        isRepeatingRef.current = isRepeating;
    }, [isRepeating]);

    const updateViewMode = useCallback(() => {
        const viewerContainer = document.getElementById('viewer-container');
        if (viewerContainer) {
            const isLandscape = viewerContainer.clientWidth > viewerContainer.clientHeight;
            setViewMode(isLandscape ? 'landscape' : 'portrait');
        }
    }, []);

    useLayoutEffect(() => {
        const timer = setTimeout(updateViewMode, 100);
        window.addEventListener('resize', updateViewMode);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateViewMode);
        };
    }, [updateViewMode]);

    useEffect(() => {
        const loadPdf = async () => {
            setError(null);
            if (!bookId) return;
            
            try {
                const jsonResponse = await fetch(`${process.env.PUBLIC_URL}/books/${bookId}.json`);
                if (!jsonResponse.ok) {
                    setError(`无法加载书籍数据: ${jsonResponse.statusText}`);
                    return;
                }
                const bookData = await jsonResponse.json();
                setBookData(bookData);
                
                const pdfFileName = bookData.pdf;
                if (!pdfFileName) { 
                    setError('书籍元数据中未找到PDF文件定义。'); 
                    return; 
                }
                
                const pdfUrl = `${process.env.PUBLIC_URL}/books/${pdfFileName}`;
                const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
                setPdfDoc(pdf);
                setNumPages(pdf.numPages);
                setCurrentPage(0);

                if (bookData.hotspots) {
                    const audioFileNames = new Set<string>();
                    const newHowlInstances: { [key: string]: Howl } = {};
                    const newAudioFiles: { [key: string]: File } = {};
                    
                    bookData.hotspots.forEach((hotspot: any) => {
                        if (hotspot.audioFile) {
                            audioFileNames.add(hotspot.audioFile);
                        }
                    });
                    
                    if (bookData.audioFile) {
                        audioFileNames.add(bookData.audioFile);
                    }
                    
                    const audioLoadPromises = Array.from(audioFileNames).map(async (audioFileName) => {
                        try {
                            const audioResponse = await fetch(`${process.env.PUBLIC_URL}/books/${audioFileName}`);
                            if (!audioResponse.ok) {
                                console.warn(`无法加载音频文件: ${audioFileName} - ${audioResponse.statusText}`);
                                return null;
                            }
                            
                            const audioBlob = await audioResponse.blob();
                            const audioFile = new File([audioBlob], audioFileName, { type: audioBlob.type });
                            newAudioFiles[audioFileName] = audioFile;
                            
                            const audioUrl = URL.createObjectURL(audioBlob);

                            const sprites: { [key: string]: [number, number] } = {};
                            bookData.hotspots.forEach((hotspot: any) => {
                                if (hotspot.audioFile === audioFileName && hotspot.id && 
                                    hotspot.audioStart !== undefined && hotspot.audioEnd !== undefined) {
                                    const startTime = hotspot.audioStart * 1000; 
                                    const duration = (hotspot.audioEnd - hotspot.audioStart) * 1000;
                                    if (duration > 0) {
                                        sprites[hotspot.id] = [startTime, duration];
                                    }
                                }
                            });

                            const audio = new Howl({
                                src: [audioUrl],
                                format: ['mp3', 'wav'],
                                sprite: sprites,
                                onplay: (spriteId) => {
                                    setIsPlaying(true);
                                },
                                onpause: () => {
                                    setIsPlaying(false);
                                },
                                onstop: () => {
                                    setIsPlaying(false);
                                    setCurrentHotspot(null);
                                },
                                onend: (spriteId) => {
                                    if (isRepeatingRef.current) {
                                        return;
                                    }

                                    if (typeof spriteId === 'number') {
                                        setIsPlaying(false);
                                        setCurrentHotspot(null);
                                        
                                        setTimeout(() => {
                                            handleNextInQueue();
                                        }, 100);
                                    }
                                }
                            });
                            newHowlInstances[audioFileName] = audio;
                            return { audioFileName, audio };
                        } catch (audioError) {
                            console.warn(`音频文件 ${audioFileName} 加载失败:`, audioError);
                            return null;
                        }
                    });
                    
                    await Promise.all(audioLoadPromises);
                    
                    console.log('音频加载完成，Howl实例:', Object.keys(newHowlInstances));
                    console.log('音频文件:', Object.keys(newAudioFiles));
                    
                    setHowlInstances(newHowlInstances);
                    setAudioFiles(newAudioFiles);
                }
            } catch (err) {
                console.error('Error loading PDF document:', err);
                setError(`加载失败: ${(err as Error).message}`);
            }
        };
        loadPdf();
    }, [bookId]);

    const handlePageChange = (page: number) => {
        const newPage = Math.max(0, Math.min(numPages - 1, page));
        setCurrentPage(newPage);
    };

    const handleNextInQueue = () => {
        if (audioQueue.length > 0) {
            const nextHotspot = audioQueue[0];
            setAudioQueue(prev => prev.slice(1));
            playHotspotAudio(nextHotspot);
        }
    };

    const playHotspotAudio = (hotspot: any) => {
        console.log('点击热点:', hotspot);
        
        if (!hotspot.id) {
            console.warn('热点没有ID:', hotspot);
            return;
        }
        
        const audioFileName = hotspot.audioFile || bookData?.audioFile;
        if (!audioFileName) {
            console.warn('热点没有关联的音频文件:', hotspot);
            return;
        }
        
        console.log('音频文件名:', audioFileName);
        console.log('可用的Howl实例:', Object.keys(howlInstances));
        
        const howl = howlInstances[audioFileName];
        if (!howl) {
            console.warn(`未找到音频文件 ${audioFileName} 的 Howl 实例`);
            console.log('当前howlInstances:', howlInstances);
            return;
        }

        console.log('找到Howl实例，准备播放热点ID:', hotspot.id);
        
        Object.values(howlInstances).forEach(h => h.stop());

        setCurrentHotspot(hotspot);

        try {
            howl.play(hotspot.id);
            console.log('播放命令已发送');
        } catch (error) {
            console.error('播放失败:', error);
        }
    };

    const handleHotspotClick = (hotspot: any, event: React.MouseEvent) => {
        event.stopPropagation();
        
        if (isRepeatMode && !isRepeating) {
            if (!repeatStartHotspot) {
                setRepeatStartHotspot(hotspot);
            } else if (!repeatEndHotspot) {
                setRepeatEndHotspot(hotspot);
                
                const startPoint = repeatStartHotspot;
                const endPoint = hotspot;

                setTimeout(() => {
                    startRepeatPlayback(startPoint, endPoint);
                }, 500);
            } else {
                setRepeatStartHotspot(hotspot);
                setRepeatEndHotspot(null);
            }
            return;
        }
        
        if (isRepeating) {
            return;
        }
        
        playHotspotAudio(hotspot);
    };

    const handleBackToShelf = () => {
        Object.values(howlInstances).forEach(howl => howl.stop());
        if (currentTimeoutRef.current) {
            clearTimeout(currentTimeoutRef.current);
        }
        navigate('/');
    };

    const startRepeatMode = () => {
        setIsRepeatMode(true);
        setRepeatStartHotspot(null);
        setRepeatEndHotspot(null);
        setIsRepeating(false);
        setRepeatPaused(false);
    };

    const exitRepeatMode = () => {
        setIsRepeatMode(false);
        setRepeatStartHotspot(null);
        setRepeatEndHotspot(null);
        setIsRepeating(false);
        setRepeatPaused(false);
        if (currentTimeoutRef.current) {
            clearTimeout(currentTimeoutRef.current);
        }
        if (repeatHowlRef.current) {
            repeatHowlRef.current.unload();
            repeatHowlRef.current = null;
        }
        Object.values(howlInstances).forEach(howl => howl.stop());
    };

    const pauseRepeat = () => {
        setRepeatPaused(true);
        if (repeatHowlRef.current) {
            repeatHowlRef.current.pause();
        }
        if (currentTimeoutRef.current) {
            clearTimeout(currentTimeoutRef.current);
        }
    };

    const resumeRepeat = () => {
        setRepeatPaused(false);
        if (repeatStartHotspot && repeatEndHotspot) {
            startRepeatPlayback(repeatStartHotspot, repeatEndHotspot);
        }
    };

    const startRepeatPlayback = (startHotspot: any, endHotspot: any) => {
        if (!startHotspot || !endHotspot) {
            console.error('复读缺少起止点');
            return;
        }

        Object.values(howlInstances).forEach(h => h.stop());
        if (repeatHowlRef.current) {
            repeatHowlRef.current.unload();
        }

        setIsRepeating(true);
        setRepeatPaused(false); 

        const audioFileName = startHotspot.audioFile || bookData?.audioFile;
        const audioFile = audioFiles[audioFileName];

        if (!audioFile) {
            console.error('复读功能所需音频文件未找到:', audioFileName);
            setIsRepeating(false);
            return;
        }

        const startTime = startHotspot.audioStart;
        const endTime = endHotspot.audioEnd;
        const duration = (endTime - startTime) * 1000;

        if (duration <= 0) {
            console.error('复读范围无效，时长为0或负数');
            setIsRepeating(false);
            return;
        }

        const playSegment = () => {
            if (!isRepeatMode || repeatPaused) {
                setIsRepeating(false);
                if (repeatHowlRef.current) {
                    repeatHowlRef.current.unload();
                    repeatHowlRef.current = null;
                }
                return;
            }

            const audioUrl = URL.createObjectURL(audioFile);
            const howl = new Howl({
                src: [audioUrl],
                format: [audioFile.type.split('/')[1] || 'mp3'],
                onload: () => {
                    howl.seek(startTime);
                    howl.play();

                    if (currentTimeoutRef.current) {
                        clearTimeout(currentTimeoutRef.current);
                    }

                    currentTimeoutRef.current = setTimeout(() => {
                        howl.unload(); 
                        repeatHowlRef.current = null;
                        
                        setTimeout(playSegment, 500);
                    }, duration);
                },
                onloaderror: (id, err) => {
                    console.error('临时Howl加载失败:', err);
                    setIsRepeating(false);
                },
                onplayerror: (id, err) => {
                    console.error('临时Howl播放失败:', err);
                    setIsRepeating(false);
                }
            });
            repeatHowlRef.current = howl;
        };

        playSegment();
    };

    const getPageDisplay = () => {
        if (!numPages) return '- / -';
        const pageNum = currentPage + 1;
        return `${pageNum} / ${numPages}`;
    };

    const getNextPage = () => {
        return currentPage + 1;
    };

    const getPrevPage = () => {
        return currentPage - 1;
    };

    const handleTocJump = (page: number) => {
        handlePageChange(page);
        setIsTocOpen(false);
    };

    const mainContent = (
        <div id="viewer-container" style={{ flex: 1, position: 'relative', backgroundColor: '#f0f0f0' }}>
            {pdfDoc && (
                <SinglePageViewer 
                    pdf={pdfDoc} 
                    currentPage={currentPage} 
                    onPageChange={handlePageChange}
                    hotspots={bookData?.hotspots}
                    onHotspotClick={handleHotspotClick}
                    currentHotspot={currentHotspot}
                    isRepeatMode={isRepeatMode}
                    repeatStartHotspot={repeatStartHotspot}
                    repeatEndHotspot={repeatEndHotspot}
                    isRepeating={isRepeating}
                />
            )}
        </div>
    );

    const renderTopBar = () => (
        <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '0.3rem 1rem', 
            backgroundColor: 'white',
            borderBottom: '1px solid #ddd',
            minHeight: '40px', 
            zIndex: 100
        }}>
            <button 
                onClick={handleBackToShelf}
                style={{ 
                    padding: '0.5rem 1rem',
                    backgroundColor: '#4a90e2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                }}
            >
                ← 返回书架
            </button>
            
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {!isRepeatMode ? (
                    <button 
                        onClick={startRepeatMode}
                        style={{ 
                            padding: '0.4rem 0.8rem',
                            backgroundColor: '#e0e0e0',
                            color: '#666',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        复读模式
                    </button>
                ) : (
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        <button 
                            onClick={exitRepeatMode}
                            style={{ 
                                padding: '0.4rem 0.8rem',
                                backgroundColor: '#ff6b35',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            复读模式
                        </button>
                        <span style={{ fontSize: '11px', color: '#666', fontWeight: 'bold' }}>
                            {!repeatStartHotspot && !repeatEndHotspot ? '① 请点击第一个热点作为复读起始位置' :
                                !repeatEndHotspot ? '② 请点击第二个热点作为复读结束位置' :
                                isRepeating ? '🔄 复读中... (自动循环播放选定范围)' : '✅ 范围已选择，正在启动复读...'}
                        </span>
                        {isRepeating && (
                            <>
                                <button 
                                    onClick={repeatPaused ? resumeRepeat : pauseRepeat}
                                    style={{ 
                                        padding: '0.3rem 0.6rem',
                                        backgroundColor: '#4a90e2',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        fontSize: '11px'
                                    }}
                                >
                                    {repeatPaused ? '继续' : '暂停'}
                                </button>
                                <button 
                                    onClick={exitRepeatMode}
                                    style={{ 
                                        padding: '0.3rem 0.6rem',
                                        backgroundColor: '#dc3545',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        fontSize: '11px'
                                    }}
                                >
                                    退出
                                </button>
                            </>
                        )}
                    </div>
                )}
                <div style={{ height: '1.5rem', display: 'flex', alignItems: 'center', visibility: (isPlaying || isRepeating) ? 'visible' : 'hidden' }}>
                    <div style={{ fontSize: '12px', color: '#ff6b35', fontWeight: 'bold' }}>
                        ♪ {isRepeating ? '复读中' : '播放中'}
                    </div>
                </div>
            </div>
            
            <div style={{ fontSize: '14px', color: '#666' }}>
                第 {getPageDisplay()} 页
            </div>
        </div>
    );

    const renderBottomBar = () => (
        <div style={{ textAlign: 'center', padding: '0.3rem 0', zIndex: 2, backgroundColor: 'white', borderTop: '1px solid #ddd' }}>
            <button 
                onClick={() => setIsTocOpen(true)}
                style={{ marginRight: '1rem', padding: '0.5rem 1rem' }}
            >
                目录
            </button>
            <button 
                onClick={() => handlePageChange(getPrevPage())} 
                disabled={currentPage <= 0}
                style={{ marginRight: '0.5rem', padding: '0.5rem 1rem' }}
            >
                上一页
            </button>
            <span style={{ margin: '0 1rem' }}> 第 {getPageDisplay()} 页 </span>
            <button 
                onClick={() => handlePageChange(getNextPage())} 
                disabled={!numPages || getNextPage() >= numPages}
                style={{ marginLeft: '0.5rem', padding: '0.5rem 1rem' }}
            >
                下一页
            </button>
        </div>
    );

    const renderSideBar = () => (
        <div style={{ 
            width: '180px',
            backgroundColor: 'white',
            borderLeft: '1px solid #ddd',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            alignItems: 'center',
            zIndex: 100
        }}>
            <button 
                onClick={handleBackToShelf}
                style={{ width: '100%', padding: '0.8rem', backgroundColor: '#4a90e2', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
                ← 返回书架
            </button>

            <div style={{ textAlign: 'center', width: '100%' }}>
                <button 
                    onClick={() => setIsTocOpen(true)}
                    style={{ width: '100%', padding: '0.8rem', marginBottom: '1rem' }}
                >
                    目录
                </button>
                <button 
                    onClick={() => handlePageChange(getPrevPage())} 
                    disabled={currentPage <= 0}
                    style={{ width: '100%', padding: '0.8rem', marginBottom: '0.5rem' }}
                >
                    上一页
                </button>
                <span style={{ display: 'block', margin: '0.5rem 0', color: '#666' }}> 第 {getPageDisplay()} 页 </span>
                <button 
                    onClick={() => handlePageChange(getNextPage())} 
                    disabled={!numPages || getNextPage() >= numPages}
                    style={{ width: '100%', padding: '0.8rem' }}
                >
                    下一页
                </button>
            </div>

            <div style={{ height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', visibility: (isPlaying || isRepeating) ? 'visible' : 'hidden' }}>
                <div style={{ fontSize: '12px', color: '#ff6b35', fontWeight: 'bold' }}>
                    ♪ {isRepeating ? '复读中' : '播放中'}
                </div>
            </div>

            <div style={{ borderTop: '1px solid #ddd', width: '100%', paddingTop: '1rem', marginTop: 'auto' }}>
                {!isRepeatMode ? (
                    <button 
                        onClick={startRepeatMode}
                        style={{ width: '100%', padding: '0.8rem' }}
                    >
                        复读模式
                    </button>
                ) : (
                    <div style={{ width: '100%' }}>
                        <button 
                            onClick={exitRepeatMode}
                            style={{ width: '100%', padding: '0.8rem', backgroundColor: '#ff6b35', color: 'white', border: 'none', borderRadius: '4px' }}
                        >
                            复读模式
                        </button>
                        <span style={{ display:'block', textAlign: 'center', fontSize: '11px', color: '#666', fontWeight: 'bold', marginTop: '0.5rem' }}>
                            {!repeatStartHotspot && !repeatEndHotspot ? '① 请点击起始热点' :
                                !repeatEndHotspot ? '② 请点击结束热点' :
                                isRepeating ? '🔄 复读中...' : '✅ 范围已选'}
                        </span>
                        {isRepeating && (
                            <div style={{marginTop: '0.5rem', display: 'flex', gap: '0.5rem'}}>
                                <button 
                                    onClick={repeatPaused ? resumeRepeat : pauseRepeat}
                                    style={{ flex: 1, padding: '0.5rem', backgroundColor: '#4a90e2', color: 'white', border: 'none', borderRadius: '3px' }}
                                >
                                    {repeatPaused ? '继续' : '暂停'}
                                </button>
                                <button 
                                    onClick={exitRepeatMode}
                                    style={{ flex: 1, padding: '0.5rem', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px' }}
                                >
                                    退出
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: viewMode === 'landscape' ? 'row' : 'column', height: '100vh', backgroundColor: '#f0f0f0' }}>
            <style>
                {`
                    .toc-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background-color: rgba(0, 0, 0, 0.5);
                        z-index: 1999;
                        opacity: 0;
                        transition: opacity 0.3s ease-in-out;
                        pointer-events: none;
                    }
                    .toc-overlay.open {
                        opacity: 1;
                        pointer-events: auto;
                    }
                    .toc-drawer {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 280px;
                        height: 100%;
                        background-color: white;
                        box-shadow: 2px 0 5px rgba(0,0,0,0.2);
                        transform: translateX(-100%);
                        transition: transform 0.3s ease-in-out;
                        z-index: 2000;
                        display: flex;
                        flex-direction: column;
                    }
                    .toc-drawer.open {
                        transform: translateX(0);
                    }
                    .toc-header {
                        padding: 1rem;
                        font-size: 1.2rem;
                        font-weight: bold;
                        border-bottom: 1px solid #ddd;
                    }
                    .toc-list {
                        flex-grow: 1;
                        overflow-y: auto;
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }
                    .toc-item {
                        padding: 0.8rem 1rem;
                        border-bottom: 1px solid #eee;
                        cursor: pointer;
                    }
                    .toc-item:hover {
                        background-color: #f5f5f5;
                    }
                    .toc-item.active {
                        background-color: #4a90e2;
                        color: white;
                        font-weight: bold;
                    }
                `}
            </style>

            <div className={`toc-overlay ${isTocOpen ? 'open' : ''}`} onClick={() => setIsTocOpen(false)}></div>
            <div className={`toc-drawer ${isTocOpen ? 'open' : ''}`}>
                <div className="toc-header">目录</div>
                <ul className="toc-list">
                    {Array.from({ length: numPages }, (_, i) => (
                        <li 
                            key={i}
                            className={`toc-item ${i === currentPage ? 'active' : ''}`}
                            onClick={() => handleTocJump(i)}
                        >
                            第 {i + 1} 页
                        </li>
                    ))}
                </ul>
            </div>
            
            {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}
            
            {viewMode === 'portrait' && renderTopBar()}
            
            {mainContent}

            {viewMode === 'portrait' && renderBottomBar()}
            {viewMode === 'landscape' && renderSideBar()}
        </div>
    );
};

export default ReaderView;