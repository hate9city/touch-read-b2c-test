import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

// 定义一本书的数据结构
interface Book {
  id: string; // 我们将使用文件名作为ID
  title: string;
}

const BookShelf: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 应用内置的书籍列表
  const BUILTIN_BOOKS = ['sample-book.json'];

  const loadBuiltinBooks = async () => {
    setError(null);
    setLoading(true);
    setBooks([]);
    
    try {
      const bookPromises = BUILTIN_BOOKS.map(async (fileName) => {
        try {
          const response = await fetch(`${process.env.PUBLIC_URL}/books/${fileName}`);
          if (!response.ok) {
            console.warn(`Failed to load ${fileName}: ${response.statusText}`);
            return null;
          }
          const data = await response.json();
          if (data.title) {
            return { id: fileName, title: data.title };
          }
          return null;
        } catch (e) {
          console.error(`Error loading ${fileName}:`, e);
          return null;
        }
      });

      const loadedBooks = (await Promise.all(bookPromises)).filter((b): b is Book => b !== null);
      
      if (loadedBooks.length === 0) {
        setError("没有找到有效的点读书文件。");
      } else {
        setBooks(loadedBooks);
      }
    } catch (err) {
      console.error('Error loading books:', err);
      setError('加载书籍列表时出错。');
    } finally {
      setLoading(false);
    }
  };

  // 组件加载时自动加载内置书籍
  useEffect(() => {
    loadBuiltinBooks();
  }, []);

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1>我的书架</h1>
        <p>离线点读应用 - 书籍已内置到应用中</p>
        {loading && <p>正在加载书籍...</p>}
      </div>

      {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1.5rem' }}>
        {books.map(book => (
          <div key={book.id} style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px', textAlign: 'center', height: '100%' }}>
            <div style={{ height: '200px', backgroundColor: '#f0f0f0', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              📚
            </div>
            <p style={{ margin: '0 0 1rem 0' }}>{book.title}</p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <Link 
                to={`/read/${encodeURIComponent(book.id)}`}
                style={{ 
                  textDecoration: 'none', 
                  padding: '0.5rem 1rem', 
                  backgroundColor: '#007bff', 
                  color: 'white', 
                  borderRadius: '4px',
                  fontSize: '0.9em'
                }}
              >
                阅读
              </Link>
              <Link 
                to={`/create/${encodeURIComponent(book.id)}`}
                style={{ 
                  textDecoration: 'none', 
                  padding: '0.5rem 1rem', 
                  backgroundColor: '#28a745', 
                  color: 'white', 
                  borderRadius: '4px',
                  fontSize: '0.9em'
                }}
              >
                制作
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BookShelf;
