import React, { createContext, useState, useContext, ReactNode } from 'react';

// 定义我们希望在 Context 中共享的数据和函数的类型
interface AppContextType {
  directoryHandle: FileSystemDirectoryHandle | null;
  setDirectoryHandle: (handle: FileSystemDirectoryHandle) => void;
}

// 创建 Context，并提供一个默认值
const AppContext = createContext<AppContextType | undefined>(undefined);

// 创建一个自定义 Hook，方便其他组件使用这个 Context
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

// 创建 Provider 组件
export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [directoryHandle, setDirectoryHandleState] = useState<FileSystemDirectoryHandle | null>(null);

  const setDirectoryHandle = (handle: FileSystemDirectoryHandle) => {
    setDirectoryHandleState(handle);
  };

  return (
    <AppContext.Provider value={{ directoryHandle, setDirectoryHandle }}>
      {children}
    </AppContext.Provider>
  );
};
