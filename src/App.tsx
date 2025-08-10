import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import BookShelf from './components/BookShelf';
import ReaderView from './components/ReaderView';
import CreatorView from './components/CreatorView';
import { AppProvider } from './contexts/AppContext';

const App: React.FC = () => {
  return (
    <AppProvider>
      <Router>
        <Routes>
          <Route path="/" element={<BookShelf />} />
          <Route path="/read/:bookId" element={<ReaderView />} />
          <Route path="/create/:bookId" element={<CreatorView />} />
        </Routes>
      </Router>
    </AppProvider>
  );
};

export default App;