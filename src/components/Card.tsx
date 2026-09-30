import React from 'react';

export const Card = ({ children, title, className = "", noPadding = false, key }: { children?: React.ReactNode, title?: string, className?: string, noPadding?: boolean, key?: React.Key }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-fb-border overflow-hidden ${className}`}>
    {title && (
      <div className="px-5 py-4 border-b border-fb-border flex items-center justify-between">
        <h3 className="text-base font-bold text-fb-textPrimary tracking-tight">
          {title}
        </h3>
      </div>
    )}
    <div className={noPadding ? '' : 'p-4 md:p-5'}>
      {children}
    </div>
  </div>
);
