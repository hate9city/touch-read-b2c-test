import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';

// 封面缓存
const coverCache = new Map<string, string>();

// 单个书籍封面的组件
const BookCover = React.memo(({ book }: { book: any }) => {
    const [coverUrl, setCoverUrl] = useState<string | null>(() => {
        // 优先使用缓存
        if (coverCache.has(book.id)) {
            return coverCache.get(book.id)!;
        }
        return book.coverImage ? `${process.env.PUBLIC_URL}/books/${book.coverImage}` : null;
    });
    const [isLoading, setIsLoading] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const generateCover = useCallback(async () => {
        if (!book.pdf || isLoading) {
            return;
        }

        setIsLoading(true);
        abortControllerRef.current = new AbortController();

        try {
            console.log(`开始生成封面: ${book.title}`);
            const pdfUrl = `${process.env.PUBLIC_URL}/books/${book.pdf}`;
            console.log(`PDF URL: ${pdfUrl}`);
            
            const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
            
            if (abortControllerRef.current?.signal.aborted) return;
            
            const page = await pdf.getPage(1);
            const canvas = canvasRef.current;
            if (!canvas) return;

            const desiredWidth = 200;
            const scale = desiredWidth / page.getViewport({ scale: 1 }).width;
            const viewport = page.getViewport({ scale });

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const context = canvas.getContext('2d');
            if (!context) return;

            await page.render({ canvasContext: context, viewport }).promise;
            
            if (!abortControllerRef.current?.signal.aborted) {
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                console.log(`封面生成成功: ${book.title}`);
                setCoverUrl(dataUrl);
                coverCache.set(book.id, dataUrl);
            }

        } catch (error) {
            if (!abortControllerRef.current?.signal.aborted) {
                console.error(`Failed to generate cover for ${book.title}:`, error);
            }
        } finally {
            setIsLoading(false);
        }
    }, [book.pdf, book.title, isLoading]);

    useEffect(() => {
        if (!coverUrl && book.pdf && !isLoading) {
            // 延迟加载封面，避免阻塞初始渲染
            const timer = setTimeout(generateCover, 100);
            return () => {
                clearTimeout(timer);
                abortControllerRef.current?.abort();
            };
        }
    }, [coverUrl, book.pdf, isLoading, generateCover]);

    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    return (
        <div style={styles.bookItem}>
            <Link to={`/read/${book.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={styles.coverContainer}>
                    {coverUrl ? (
                        <img 
                            src={coverUrl} 
                            alt={book.title} 
                            style={styles.coverImage}
                            loading="lazy"
                        />
                    ) : (
                        <div style={styles.coverPlaceholder}>
                            <canvas ref={canvasRef} style={{ display: 'none' }} />
                            {isLoading ? (
                                <div style={styles.loadingSpinner}>
                                    <div style={styles.spinner}></div>
                                    <p>生成封面...</p>
                                </div>
                            ) : (
                                <p>点击生成封面</p>
                            )}
                        </div>
                    )}
                </div>
            </Link>
            <h3 style={styles.bookTitle}>{book.title}</h3>
            <div style={styles.buttonGroup}>
                <Link to={`/read/${book.id}`}><button style={styles.button}>阅读</button></Link>
                <Link to={`/create/${book.id}`}><button style={{...styles.button, ...styles.createButton}}>制作</button></Link>
            </div>
        </div>
    );
});

BookCover.displayName = 'BookCover';

// 书架主组件
const BookShelf: React.FC = () => {
    const [books, setBooks] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // 预加载书籍数据
    const preloadBooks = useCallback(async () => {
        try {
            const bookIds = ['sample-book.json'];
            const bookPromises = bookIds.map(async (id) => {
                const response = await fetch(`${process.env.PUBLIC_URL}/books/${id}`, {
                    headers: {
                        'Cache-Control': 'max-age=3600' // 缓存1小时
                    }
                });
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${id}`);
                }
                const bookData = await response.json();
                bookData.id = id.replace('.json', '');
                return bookData;
            });

            const loadedBooks = await Promise.all(bookPromises);
            setBooks(loadedBooks);
        } catch (err: any) {
            setError(err.message);
            console.error("Failed to load books:", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        preloadBooks();
    }, [preloadBooks]);

    // 预加载下一本书的PDF（如果用户可能访问）
    useEffect(() => {
        if (books.length > 0) {
            const preloadNextBook = async () => {
                const firstBook = books[0];
                if (firstBook?.pdf) {
                    try {
                        const pdfUrl = `${process.env.PUBLIC_URL}/books/${firstBook.pdf}`;
                        // 预加载PDF但不渲染
                        const link = document.createElement('link');
                        link.rel = 'preload';
                        link.as = 'document';
                        link.href = pdfUrl;
                        document.head.appendChild(link);
                    } catch (error) {
                        console.warn('Failed to preload PDF:', error);
                    }
                }
            };
            
            // 延迟预加载，避免阻塞初始渲染
            const timer = setTimeout(preloadNextBook, 2000);
            return () => clearTimeout(timer);
        }
    }, [books]);

    if (isLoading) {
        return (
            <div style={styles.container}>
                <div style={styles.loadingContainer}>
                    <div style={styles.loadingSpinner}>
                        <div style={styles.spinner}></div>
                        <p>加载书架中...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return <div style={styles.container}><p style={{color: 'red'}}>Error loading books: {error}</p></div>;
    }

    return (
        <div style={styles.container}>
            <h1 style={styles.shelfTitle}>我的书架</h1>
            <div style={styles.shelfGrid}>
                {books.map(book => (
                    <BookCover key={book.id} book={book} />
                ))}
            </div>
        </div>
    );
};

// 样式
const styles: { [key: string]: React.CSSProperties } = {
    container: {
        padding: '2rem',
        backgroundColor: '#f8f8f8',
        minHeight: '100vh'
    },
    loadingContainer: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '50vh'
    },
    loadingSpinner: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem'
    },
    spinner: {
        width: '40px',
        height: '40px',
        border: '4px solid #f3f3f3',
        borderTop: '4px solid #4a90e2',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
    },
    shelfTitle: {
        fontSize: '2.5rem',
        marginBottom: '2rem',
        textAlign: 'center',
        color: '#333'
    },
    shelfGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '2rem',
        justifyContent: 'center'
    },
    bookItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
    },
    coverContainer: {
        width: '200px',
        height: '280px',
        backgroundColor: '#e0e0e0',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        marginBottom: '1rem',
        cursor: 'pointer',
        transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
    },
    coverImage: {
        width: '100%',
        height: '100%',
        objectFit: 'cover'
    },
    coverPlaceholder: {
        color: '#999',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem'
    },
    bookTitle: {
        fontSize: '1rem',
        color: '#444',
        fontWeight: 'bold',
        marginBottom: '0.75rem'
    },
    buttonGroup: {
        display: 'flex',
        gap: '0.5rem'
    },
    button: {
        padding: '0.5rem 1rem',
        border: 'none',
        borderRadius: '4px',
        backgroundColor: '#4a90e2',
        color: 'white',
        cursor: 'pointer',
        fontSize: '0.9rem'
    },
    createButton: {
        backgroundColor: '#50c878'
    }
};

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

export default BookShelf;
