import React, { useEffect, useState, useRef, useCallback, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import HTMLFlipBook from 'react-pageflip';
import * as pdfjsLib from 'pdfjs-dist';
import { Howl } from 'howler';

pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.js`;

const AnyHTMLFlipBook = HTMLFlipBook as any;

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
    const [pageScale, setPageScale] = useState(1);

    useEffect(() => {
        if (!shouldRender) {
            setIsRendered(false);
            return;
        }
        
        const currentRenderId = ++renderIdRef.current;
        
        const render = async () => {
            const canvas = canvasRef.current;
            if (!pdf || !canvas || width <= 0 || height <= 0) return;
            
            // 如果已经在渲染，等待完成
            if (isRenderingRef.current && renderTaskRef.current) {
                try {
                    renderTaskRef.current.cancel();
                } catch (e) {
                    // 忽略取消错误
                }
                renderTaskRef.current = null;
            }
            
            // 检查是否是当前的渲染任务
            if (currentRenderId !== renderIdRef.current) {
                return;
            }
            
            isRenderingRef.current = true;
            setIsRendered(false);
            
            try {
                const page = await pdf.getPage(pageNumber);
                
                // 再次检查是否是当前的渲染任务
                if (currentRenderId !== renderIdRef.current) {
                    return;
                }
                
                const dpr = window.devicePixelRatio || 1;
                const viewport = page.getViewport({ scale: 1 });
                const scale = Math.min(width / viewport.width, height / viewport.height);
                const cssWidth = viewport.width * scale;
                const cssHeight = viewport.height * scale;
                canvas.style.width = `${cssWidth}px`;
                canvas.style.height = `${cssHeight}px`;
                canvas.width = Math.floor(cssWidth * dpr);
                canvas.height = Math.floor(cssHeight * dpr);
                const context = canvas.getContext('2d');
                if (!context) return;
                
                // 清空 canvas
                context.clearRect(0, 0, canvas.width, canvas.height);
                
                const renderViewport = page.getViewport({ scale: scale * dpr });
                
                // 保存scale用于热点定位
                setPageScale(scale);
                
                renderTaskRef.current = page.render({ canvasContext: context, viewport: renderViewport } as any);
                
                await renderTaskRef.current.promise;
                
                // 最后检查是否还是当前的渲染任务
                if (currentRenderId === renderIdRef.current) {
                    setIsRendered(true);
                }
                
                renderTaskRef.current = null;
                isRenderingRef.current = false;
            } catch (e: any) {
                if (e.name !== 'RenderingCancelledException') {
                    console.error(`Render error on page ${pageNumber}:`, e);
                }
                renderTaskRef.current = null;
                isRenderingRef.current = false;
            }
        };
        
        // 使用setTimeout确保渲染任务序列化
        const timeoutId = setTimeout(render, 0);
        
        return () => {
            clearTimeout(timeoutId);
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
    }, [pdf, pageNumber, width, height, shouldRender]);

    return (
        <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
            <canvas 
                ref={canvasRef} 
                style={{ 
                    display: shouldRender ? 'block' : 'none',
                    backgroundColor: shouldRender && !isRendered ? '#f5f5f5' : 'transparent',
                    opacity: (isRepeatMode && !isRepeating) && shouldRender ? 0.7 : 1, // 复读模式下页面变暗，但复读中恢复亮度
                    transition: 'opacity 0.3s ease'
                }} 
            />
            {/* 渲染热点 */}
            {shouldRender && isRendered && hotspots && hotspots
                .filter(hotspot => hotspot.pageNumber === pageNumber)
                .map(hotspot => {
                    const canvas = canvasRef.current;
                    if (!canvas) return null;
                    
                    const canvasRect = canvas.getBoundingClientRect();
                    const canvasStyle = getComputedStyle(canvas);
                    const actualWidth = parseFloat(canvasStyle.width);
                    const actualHeight = parseFloat(canvasStyle.height);
                    
                    const isCurrentPlaying = currentHotspot && currentHotspot.id === hotspot.id;
                    const isRepeatStart = repeatStartHotspot && repeatStartHotspot.id === hotspot.id;
                    const isRepeatEnd = repeatEndHotspot && repeatEndHotspot.id === hotspot.id;
                    
                    // 复读模式下的样式
                    let borderColor = 'rgba(255, 107, 53, 0.8)';
                    let backgroundColor = 'rgba(255, 107, 53, 0.2)';
                    let borderWidth = '2px';
                    
                    if (isRepeatMode) {
                        if (isRepeatStart) {
                            borderColor = '#00ff00'; // 绿色表示起始点
                            backgroundColor = 'rgba(0, 255, 0, 0.3)';
                            borderWidth = '3px';
                        } else if (isRepeatEnd) {
                            borderColor = '#ff0000'; // 红色表示结束点
                            backgroundColor = 'rgba(255, 0, 0, 0.3)';
                            borderWidth = '3px';
                        } else {
                            // 复读模式下普通热点保持正常亮度
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

const FlipBookViewer = ({ pdf, numPages, onPageChange, currentPage, hotspots, onHotspotClick, currentHotspot, isRepeatMode, repeatStartHotspot, repeatEndHotspot, isRepeating }: { 
    pdf: pdfjsLib.PDFDocumentProxy, 
    numPages: number, 
    onPageChange: (page: number) => void, 
    currentPage: number,
    hotspots?: any[],
    onHotspotClick?: (hotspot: any, event: React.MouseEvent) => void,
    currentHotspot?: any,
    isRepeatMode?: boolean,
    repeatStartHotspot?: any,
    repeatEndHotspot?: any,
    isRepeating?: boolean
}) => {
    const [bookSize, setBookSize] = useState({ width: 1, height: 1 });
    const [isFlipBookReady, setIsFlipBookReady] = useState(false);
    const flipBookRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isSyncingRef = useRef(false); // 防止循环同步
    const lastSyncedPageRef = useRef(-1); // 记录上次同步的页面

    const onFlipBookInit = useCallback(() => {
        console.log('FlipBook has been initialized.');
        setIsFlipBookReady(true);
    }, []);

    const calculateSize = useCallback(async () => {
        if (!pdf || !containerRef.current) return;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const pageRatio = viewport.height / viewport.width;
        
        // 获取实际可用空间，减去顶部10px + 底部10px = 20px
        const availableHeight = containerRef.current.clientHeight - 20; 
        // 减去左右各10px = 20px
        const availableWidth = containerRef.current.clientWidth - 20;
        
        // 优化双页布局计算
        // 先按高度计算单页尺寸
        let singlePageHeight = availableHeight;
        let singlePageWidth = singlePageHeight / pageRatio;
        
        // 检查双页宽度是否超出可用宽度（考虑页面间的最小间隙）
        const minGap = 10; // 页面间隙
        const totalDoublePageWidth = singlePageWidth * 2 + minGap;
        
        if (totalDoublePageWidth > availableWidth) {
            // 按宽度重新计算，确保双页能完整显示
            const availableWidthForPages = availableWidth - minGap;
            singlePageWidth = availableWidthForPages / 2;
            singlePageHeight = singlePageWidth * pageRatio;
        }
        
        setBookSize({ width: singlePageWidth, height: singlePageHeight });
    }, [pdf]);

    useLayoutEffect(() => {
        calculateSize();
        window.addEventListener('resize', calculateSize);
        return () => window.removeEventListener('resize', calculateSize);
    }, [calculateSize]);

    useEffect(() => {
        const syncFlipBookPage = () => {
            if (isFlipBookReady && flipBookRef.current && bookSize.width > 1 && !isSyncingRef.current) {
                try {
                    const flipBook = flipBookRef.current.pageFlip();
                    if (!flipBook) { // 增加一个额外的安全检查
                        console.warn('pageFlip() returned undefined. FlipBook might not be ready.');
                        return;
                    }
                    const currentFlipPage = flipBook.getCurrentPageIndex();
                    
                    // 只在页面真正需要同步时才执行
                    if (currentFlipPage !== currentPage && lastSyncedPageRef.current !== currentPage) {
                        console.log(`FlipBook sync - currentPage: ${currentPage}, flipPage: ${currentFlipPage}`);
                        isSyncingRef.current = true;
                        flipBook.turnToPage(currentPage);
                        lastSyncedPageRef.current = currentPage;
                        console.log(`Turning flipbook to page: ${currentPage}`);
                        
                        // 延迟重置同步状态，避免过快的重复操作
                        setTimeout(() => {
                            isSyncingRef.current = false;
                        }, 300);
                    }
                } catch (error) {
                    console.error('Error syncing flipbook page:', error);
                    isSyncingRef.current = false;
                }
            }
        };

        // 仅在FlipBook准备好后才尝试同步
        if (isFlipBookReady) {
            syncFlipBookPage();
        }

    }, [currentPage, bookSize.width, isFlipBookReady]);

    const handleFlipBookPageChange = (e: any) => {
        // 如果正在同步中，忽略FlipBook的回调，避免循环
        if (isSyncingRef.current) {
            console.log(`Ignoring FlipBook callback during sync: ${e.data}`);
            return;
        }
        
        const newPage = e.data;
        console.log(`FlipBook page changed to: ${newPage}`);
        lastSyncedPageRef.current = newPage;
        onPageChange(newPage);
    };

    // 计算哪些页面应该渲染（当前页面及相邻页面）
    const shouldRenderPage = (pageNum: number) => {
        const renderRange = 2; // 渲染当前页面前后2页
        return Math.abs(pageNum - (currentPage + 1)) <= renderRange;
    };

    const pages = [];
    for (let i = 1; i <= numPages; i++) {
        pages.push(
            <div key={i} data-density="soft" style={{ backgroundColor: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <PdfPage 
                    pdf={pdf} 
                    pageNumber={i} 
                    width={bookSize.width} 
                    height={bookSize.height} 
                    shouldRender={shouldRenderPage(i)}
                    hotspots={hotspots}
                    onHotspotClick={onHotspotClick}
                    currentHotspot={currentHotspot}
                    isRepeatMode={isRepeatMode}
                    repeatStartHotspot={repeatStartHotspot}
                    repeatEndHotspot={repeatEndHotspot}
                    isRepeating={isRepeating}
                />
            </div>
        );
    }
    if (numPages % 2 !== 0) {
        pages.push(<div key="blank" data-density="soft" style={{ backgroundColor: 'white' }}></div>);
    }

    return (
        <div ref={containerRef} style={{ 
            position: 'absolute', 
            width: '100%', 
            height: '100%', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'flex-start', // 改为顶部对齐
            overflow: 'hidden',
            padding: '0'
        }}>
            {bookSize.width > 1 && (
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'flex-start', // 改为顶部对齐
                    width: '100%',
                    height: '100%',
                    paddingTop: '10px', // 顶部少量边距
                    paddingBottom: '10px', // 底部边距
                    paddingLeft: '10px',
                    paddingRight: '10px'
                }}>
                    <AnyHTMLFlipBook 
                        width={bookSize.width} 
                        height={bookSize.height} 
                        onFlip={handleFlipBookPageChange}
                        onInit={onFlipBookInit} // 使用onInit回调
                        showCover={true} 
                        ref={flipBookRef} 
                        size="fixed" 
                        mobileScrollSupport={true} 
                        maxShadowOpacity={0.3}
                        drawShadow={true}
                        flippingTime={600}
                        clickEventForward={false}
                        swipeDistance={50}
                        disableFlipByClick={true}
                        usePortrait={false}
                        startPage={0}
                        autoSize={false}
                        minWidth={bookSize.width}
                        maxWidth={bookSize.width}
                        minHeight={bookSize.height}
                        maxHeight={bookSize.height}
                    >
                        {pages}
                    </AnyHTMLFlipBook>
                </div>
            )}
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

    const calculateSize = useCallback(async () => {
        if (!pdf || !containerRef.current) return;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const pageRatio = viewport.height / viewport.width;
        
        // 获取实际可用空间，减去少量边距
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

    // 处理翻页动画
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

    const handlePrevious = () => {
        if (currentPage > 0) {
            onPageChange(currentPage - 1);
        }
    };

    const handleNext = () => {
        onPageChange(currentPage + 1);
    };

    return (
        <div ref={containerRef} style={{ 
            position: 'absolute', 
            width: '100%', 
            height: '100%', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            padding: '0' // 移除padding
        }}>
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
                    {/* 移除左右点击区域，只保留滑动和按钮翻页 */}
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
    const [viewMode, setViewMode] = useState('landscape');
    const [error, setError] = useState<string | null>(null);
    const [bookData, setBookData] = useState<any>(null);
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [howlInstances, setHowlInstances] = useState<{ [key: string]: Howl }>({});
    const [audioFiles, setAudioFiles] = useState<{ [key: string]: File }>({});
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentHotspot, setCurrentHotspot] = useState<any>(null);
    const [audioQueue, setAudioQueue] = useState<any[]>([]);
    const [isRepeatMode, setIsRepeatMode] = useState(false);
    const [isConnectedMode, setIsConnectedMode] = useState(false);
    const [repeatStartHotspot, setRepeatStartHotspot] = useState<any>(null);
    const [repeatEndHotspot, setRepeatEndHotspot] = useState<any>(null);
    const [isRepeating, setIsRepeating] = useState(false);
    const [repeatPaused, setRepeatPaused] = useState(false);
    const [showRepeatNotification, setShowRepeatNotification] = useState(false);
    const [repeatNotificationText, setRepeatNotificationText] = useState('');
    const controlsRef = useRef<HTMLDivElement>(null);
    const currentTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const repeatHowlRef = useRef<Howl | null>(null); // 用于持有临时的复读Howl实例

    // 使用ref来跟踪最新的复读状态，以解决Howl事件处理器中的闭包问题
    const isRepeatingRef = useRef(isRepeating);
    useEffect(() => {
        isRepeatingRef.current = isRepeating;
    }, [isRepeating]);

    const updateViewMode = useCallback(() => {
        const container = document.getElementById('viewer-container');
        if (container) {
            setViewMode(container.clientWidth > container.clientHeight ? 'landscape' : 'portrait');
        }
    }, []);

    useLayoutEffect(() => {
        updateViewMode();
        window.addEventListener('resize', updateViewMode);
        return () => window.removeEventListener('resize', updateViewMode);
    }, [updateViewMode]);

    useEffect(() => {
        const loadPdf = async () => {
            setError(null);
            if (!bookId) return;
            
            try {
                // 加载书籍JSON数据
                const jsonResponse = await fetch(`${process.env.PUBLIC_URL}/books/${bookId}`);
                if (!jsonResponse.ok) {
                    setError(`无法加载书籍数据: ${jsonResponse.statusText}`);
                    return;
                }
                const bookData = await jsonResponse.json();
                setBookData(bookData);
                
                // 加载PDF文件
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

                // 加载音频文件 - 支持多个音频文件
                if (bookData.hotspots) {
                    const audioFileNames = new Set<string>();
                    const newHowlInstances: { [key: string]: Howl } = {};
                    const newAudioFiles: { [key: string]: File } = {};
                    
                    // 收集所有需要的音频文件
                    bookData.hotspots.forEach((hotspot: any) => {
                        if (hotspot.audioFile) {
                            audioFileNames.add(hotspot.audioFile);
                        }
                    });
                    
                    // 如果有全局音频文件，也加入
                    if (bookData.audioFile) {
                        audioFileNames.add(bookData.audioFile);
                    }
                    
                    // 加载所有音频文件
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
                            
                            // 创建Howl音频实例
                            const audioUrl = URL.createObjectURL(audioBlob);

                            // 为这个音频文件创建音频精灵
                            const sprites: { [key: string]: [number, number] } = {};
                            bookData.hotspots.forEach((hotspot: any) => {
                                if (hotspot.audioFile === audioFileName && hotspot.id && 
                                    hotspot.audioStart !== undefined && hotspot.audioEnd !== undefined) {
                                    const startTime = hotspot.audioStart * 1000; // 转换为毫秒
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
                                    console.log(`Howl onplay event for sprite: ${spriteId} from ${audioFileName}`);
                                    setIsPlaying(true);
                                },
                                onpause: () => {
                                    console.log(`Howl onpause event from ${audioFileName}`);
                                    setIsPlaying(false);
                                },
                                onstop: () => {
                                    console.log(`Howl onstop event from ${audioFileName}`);
                                    setIsPlaying(false);
                                    setCurrentHotspot(null);
                                },
                                onend: (spriteId) => {
                                    // 在复读模式下，循环是由我们自己的定时器控制的，所以要忽略这里的onend事件
                                    if (isRepeatingRef.current) {
                                        console.log('onend event ignored during repeat mode.');
                                        return;
                                    }

                                    console.log(`Howl onend event for sprite: ${spriteId} from ${audioFileName}`);
                                    if (typeof spriteId === 'number') {
                                        setIsPlaying(false);
                                        setCurrentHotspot(null);
                                        
                                        // 处理连读队列
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
                    
                    // 等待所有音频文件加载完成
                    await Promise.all(audioLoadPromises);
                    
                    setHowlInstances(newHowlInstances);
                    setAudioFiles(newAudioFiles);
                    
                    // 向后兼容：如果有全局audioFile，设置旧的audioFile状态
                    if (bookData.audioFile && newAudioFiles[bookData.audioFile]) {
                        setAudioFile(newAudioFiles[bookData.audioFile]);
                    }
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
        console.log(`Page change requested: ${page}, setting to: ${newPage}, numPages: ${numPages}`); // 调试日志
        setCurrentPage(newPage);
    };

    // 处理连读队列中的下一个音频
    const handleNextInQueue = () => {
        if (audioQueue.length > 0) {
            const nextHotspot = audioQueue[0];
            setAudioQueue(prev => prev.slice(1));
            playHotspotAudio(nextHotspot);
        }
    };

    // 播放热点音频的核心函数
    const playHotspotAudio = (hotspot: any) => {
        if (!hotspot.id) return;
        
        // 确定使用哪个音频文件
        const audioFileName = hotspot.audioFile || bookData?.audioFile;
        if (!audioFileName) {
            console.warn('热点没有关联的音频文件:', hotspot);
            return;
        }
        
        const howl = howlInstances[audioFileName];
        if (!howl) {
            console.warn(`未找到音频文件 ${audioFileName} 的 Howl 实例`);
            return;
        }

        console.log(`Playing hotspot sprite: ${hotspot.id} from audio file: ${audioFileName}`);

        // 停止所有音频播放
        Object.values(howlInstances).forEach(h => h.stop());

        // 设置当前高亮的热点
        setCurrentHotspot(hotspot);

        // 播放指定的音频精灵
        howl.play(hotspot.id);
    };

    const handleHotspotClick = (hotspot: any, event: React.MouseEvent) => {
        event.stopPropagation(); // 阻止事件冒泡，防止触发翻页
        console.log('Hotspot clicked:', hotspot);
        
        // 复读模式下的特殊处理
        if (isRepeatMode && !isRepeating) {
            if (!repeatStartHotspot) {
                // 设置起始热点
                setRepeatStartHotspot(hotspot);
                console.log('Set repeat start hotspot:', hotspot.id);
            } else if (!repeatEndHotspot) {
                // 设置结束热点
                setRepeatEndHotspot(hotspot);
                console.log('Set repeat end hotspot:', hotspot.id);
                
                // 由于状态更新是异步的，直接将hotspot（结束点）和当前的repeatStartHotspot传入
                const startPoint = repeatStartHotspot;
                const endPoint = hotspot;

                console.log('选择的起始热点:', startPoint);
                console.log('选择的结束热点:', endPoint);
                console.log(`复读范围: ${startPoint.audioStart}s - ${endPoint.audioEnd}s`);
                console.log('范围选择完成，即将自动开始播放...');
                
                // 显示非阻塞提示
                const notificationText = `复读范围已选择完成！\n起始: ${startPoint.audioStart?.toFixed(2)}s-${startPoint.audioEnd?.toFixed(2)}s\n结束: ${endPoint.audioStart?.toFixed(2)}s-${endPoint.audioEnd?.toFixed(2)}s\n播放范围: ${startPoint.audioStart?.toFixed(2)}s-${endPoint.audioEnd?.toFixed(2)}s`;
                setRepeatNotificationText(notificationText);
                setShowRepeatNotification(true);
                
                // 3秒后自动隐藏通知
                setTimeout(() => {
                    setShowRepeatNotification(false);
                }, 3000);
                
                // 立即开始复读播放并恢复页面亮度
                setTimeout(() => {
                    console.log('延迟500ms后开始播放...');
                    startRepeatPlayback(startPoint, endPoint);
                }, 500);
            } else {
                // 重新选择起始点
                setRepeatStartHotspot(hotspot);
                setRepeatEndHotspot(null);
                console.log('Reset and set new repeat start hotspot:', hotspot.id);
            }
            return;
        }
        
        // 如果正在复读中，忽略点击
        if (isRepeating) {
            return;
        }
        
        // 连读模式：添加到播放队列
        if (isConnectedMode) {
            if (isPlaying) {
                // 如果正在播放，添加到队列
                setAudioQueue(prev => [...prev, hotspot]);
            } else {
                // 如果没有播放，直接播放
                playHotspotAudio(hotspot);
            }
            return;
        }
        
        // 普通模式：直接播放
        playHotspotAudio(hotspot);
    };

    // 返回书架
    const handleBackToShelf = () => {
        // 停止音频播放
        Object.values(howlInstances).forEach(howl => howl.stop());
        // 清理定时器
        if (currentTimeoutRef.current) {
            clearTimeout(currentTimeoutRef.current);
        }
        navigate('/');
    };

    // 复读相关函数
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
        // 清理定时器
        if (currentTimeoutRef.current) {
            clearTimeout(currentTimeoutRef.current);
        }
        // 停止并卸载临时的复读Howl实例
        if (repeatHowlRef.current) {
            repeatHowlRef.current.unload();
            repeatHowlRef.current = null;
        }
        // 停止所有其他音频
        Object.values(howlInstances).forEach(howl => howl.stop());
    };

    const pauseRepeat = () => {
        setRepeatPaused(true);
        if (repeatHowlRef.current) {
            repeatHowlRef.current.pause();
        }
        // 清除即将开始下一次循环的定时器
        if (currentTimeoutRef.current) {
            clearTimeout(currentTimeoutRef.current);
        }
    };

    const resumeRepeat = () => {
        setRepeatPaused(false);
        // 恢复时，重新触发循环播放
        if (repeatStartHotspot && repeatEndHotspot) {
            startRepeatPlayback(repeatStartHotspot, repeatEndHotspot);
        }
    };

    const startRepeatPlayback = (startHotspot: any, endHotspot: any) => {
        if (!startHotspot || !endHotspot) {
            console.error('复读缺少起止点');
            return;
        }

        // 停止所有当前播放的音频
        Object.values(howlInstances).forEach(h => h.stop());
        if (repeatHowlRef.current) {
            repeatHowlRef.current.unload();
        }

        setIsRepeating(true);
        setRepeatPaused(false); // 确保不是暂停状态

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
            // 每次循环前都检查是否已退出或暂停
            if (!isRepeatMode || repeatPaused) {
                console.log('复读已退出或暂停，停止循环。');
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
                    console.log(`🎵 临时Howl加载成功，开始播放片段: ${startTime}s`);
                    howl.seek(startTime);
                    howl.play();

                    // 清理旧的定时器以防万一
                    if (currentTimeoutRef.current) {
                        clearTimeout(currentTimeoutRef.current);
                    }

                    currentTimeoutRef.current = setTimeout(() => {
                        console.log('⏹️ 片段播放时长结束');
                        howl.unload(); // 卸载当前实例，释放内存
                        repeatHowlRef.current = null;
                        
                        // 延迟后开始下一次循环
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

        playSegment(); // 立即开始第一次循环
    };

    // 连读模式相关函数
    const startConnectedMode = () => {
        setIsConnectedMode(true);
        // 连读模式播放第一个可用的音频文件
        const audioFileNames = Object.keys(howlInstances);
        if (audioFileNames.length > 0) {
            const firstHowl = howlInstances[audioFileNames[0]];
            firstHowl.seek(0);
            firstHowl.play();
        }
    };

    const exitConnectedMode = () => {
        setIsConnectedMode(false);
        Object.values(howlInstances).forEach(howl => howl.stop());
    };

    const pauseConnected = () => {
        Object.values(howlInstances).forEach(howl => {
            if (howl.playing()) {
                howl.pause();
            }
        });
    };

    const resumeConnected = () => {
        Object.values(howlInstances).forEach(howl => {
            if (!howl.playing()) {
                howl.play();
            }
        });
    };

    // 计算页码显示范围
    const getPageDisplay = () => {
        if (!numPages) return '- / -';
        
        if (viewMode === 'portrait') {
            // 竖屏单页模式
            return `${currentPage + 1} / ${numPages}`;
        } else {
            // 横屏双页模式
            const isFirstPage = currentPage === 0; // 封面
            const isLastPage = currentPage === numPages - 1; // 封底
            
            if (isFirstPage || isLastPage) {
                // 封面或封底单页显示
                return `${currentPage + 1} / ${numPages}`;
            } else {
                // 双页显示
                const leftPage = currentPage + 1;
                const rightPage = Math.min(currentPage + 2, numPages);
                return `${leftPage}-${rightPage} / ${numPages}`;
            }
        }
    };

    // 计算下一页的页码（考虑双页跳跃）
    const getNextPage = () => {
        if (viewMode === 'portrait') {
            return currentPage + 1;
        } else {
            // 横屏模式
            const isFirstPage = currentPage === 0;
            if (isFirstPage) {
                // 从封面跳到第2-3页
                return currentPage + 2;
            } else {
                // 正常双页跳跃
                return currentPage + 2;
            }
        }
    };

    // 计算上一页的页码（考虑双页跳跃）
    const getPrevPage = () => {
        if (viewMode === 'portrait') {
            return currentPage - 1;
        } else {
            // 横屏模式
            if (currentPage <= 1) {
                // 跳回封面
                return 0;
            } else {
                // 正常双页跳跃
                return currentPage - 2;
            }
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f0f0f0' }}>
            {/* 添加CSS动画样式 */}
            <style>
                {`
                    @keyframes pulse {
                        0% { opacity: 0.4; }
                        50% { opacity: 0.8; }
                        100% { opacity: 0.4; }
                    }
                `}
            </style>
            
            {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}
            
            {/* 顶部控制栏 */}
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '0.3rem 1rem',  // 减少padding 
                backgroundColor: 'white',
                borderBottom: '1px solid #ddd',
                minHeight: '40px',  // 减少高度
                zIndex: 100
            }}>
                {/* 左上角返回按钮 */}
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
                
                {/* 中间播放模式控制 */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* 复读模式 */}
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
                    
                    {/* 连读模式 */}
                    {!isConnectedMode ? (
                        <button 
                            onClick={startConnectedMode}
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
                            连读模式
                        </button>
                    ) : (
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            <button 
                                onClick={exitConnectedMode}
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
                                连读模式
                            </button>
                            <button 
                                onClick={isPlaying ? pauseConnected : resumeConnected}
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
                                {isPlaying ? '暂停' : '播放'}
                            </button>
                            <button 
                                onClick={exitConnectedMode}
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
                        </div>
                    )}
                    
                    {/* 播放状态指示 */}
                    {(isPlaying || isRepeating) && (
                        <div style={{ 
                            fontSize: '12px', 
                            color: '#ff6b35',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            ♪ {isRepeating ? '复读中' : '播放中'}
                        </div>
                    )}
                </div>
                
                {/* 右侧页码显示 */}
                <div style={{ fontSize: '14px', color: '#666' }}>
                    第 {getPageDisplay()} 页
                </div>
            </div>
            
            <div ref={controlsRef} style={{ textAlign: 'center', padding: '0.3rem 0', zIndex: 2, backgroundColor: 'white', borderBottom: '1px solid #ddd' }}>
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
            <div id="viewer-container" style={{ flex: 1, position: 'relative' }}>
                {pdfDoc && (
                    viewMode === 'landscape' ? 
                    <FlipBookViewer 
                        pdf={pdfDoc} 
                        numPages={numPages} 
                        onPageChange={handlePageChange} 
                        currentPage={currentPage}
                        hotspots={bookData?.hotspots}
                        onHotspotClick={handleHotspotClick}
                        currentHotspot={currentHotspot}
                        isRepeatMode={isRepeatMode}
                        repeatStartHotspot={repeatStartHotspot}
                        repeatEndHotspot={repeatEndHotspot}
                        isRepeating={isRepeating}
                    /> : 
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
        </div>
    );
};

export default ReaderView;