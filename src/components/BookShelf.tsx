import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';

// 单个书籍封面的组件
const BookCover = ({ book }: { book: any }) => {
    const [coverUrl, setCoverUrl] = useState<string | null>(book.coverImage ? `${process.env.PUBLIC_URL}/books/${book.coverImage}` : null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (coverUrl || !book.pdf) {
            return;
        }

        let isMounted = true;

        const generateCover = async () => {
            try {
                const pdfUrl = `${process.env.PUBLIC_URL}/books/${book.pdf}`;
                const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
                const page = await pdf.getPage(1);

                const canvas = canvasRef.current;
                if (!canvas || !isMounted) return;

                const desiredWidth = 200;
                const scale = desiredWidth / page.getViewport({ scale: 1 }).width;
                const viewport = page.getViewport({ scale });

                canvas.width = viewport.width;
                canvas.height = viewport.height;

                const context = canvas.getContext('2d');
                if (!context) return;

                await page.render({ canvasContext: context, viewport }).promise;
                
                if (isMounted) {
                    setCoverUrl(canvas.toDataURL('image/jpeg', 0.8));
                }

            } catch (error) {
                console.error(`Failed to generate cover for ${book.title}:`, error);
            }
        };

        generateCover();

        return () => {
            isMounted = false;
        };

    }, [book, coverUrl]);

    return (
        <div style={styles.bookItem}>
            <Link to={`/read/${book.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={styles.coverContainer}>
                    {coverUrl ? (
                        <img src={coverUrl} alt={book.title} style={styles.coverImage} />
                    ) : (
                        <div style={styles.coverPlaceholder}>
                            <canvas ref={canvasRef} style={{ display: 'none' }} />
                            <p>Loading...</p>
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
};

// 书架主组件
const BookShelf: React.FC = () => {
    const [books, setBooks] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchBooks = async () => {
            try {
                const bookIds = ['sample-book.json'];

                const bookPromises = bookIds.map(async (id) => {
                    const response = await fetch(`${process.env.PUBLIC_URL}/books/${id}`);
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
            }
        };

        fetchBooks();
    }, []);

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
        color: '#999'
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

export default BookShelf;
