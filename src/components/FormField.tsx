import React from 'react';

export const FormField = ({ label, name, value, onChange, type = "text", placeholder = "", disabled = false }: { 
  label: string, 
  name: string, 
  value: any, 
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void,
  type?: string, 
  placeholder?: string,
  disabled?: boolean
}) => (
  <div className="space-y-1.5 flex-1 min-w-[140px]">
    <label className="text-[10px] font-black text-black ml-1 uppercase tracking-widest">{label}</label>
    {type === 'textarea' ? (
      <textarea 
        name={name} 
        value={value || ''} 
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        className={`w-full border-2 border-fb-gray rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all placeholder:text-gray-300 resize-none text-black ${
          disabled 
          ? 'bg-fb-gray/40 cursor-not-allowed opacity-80' 
          : 'bg-white focus:border-fb-blue focus:shadow-[0_0_0_4px_rgba(24,119,242,0.1)]'
        }`}
      />
    ) : (
      <input 
        type={type} 
        name={name} 
        value={value || ''} 
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full border-2 border-fb-gray rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all placeholder:text-gray-300 text-black ${
          disabled 
          ? 'bg-fb-gray/40 cursor-not-allowed opacity-80' 
          : 'bg-white focus:border-fb-blue focus:shadow-[0_0_0_4px_rgba(24,119,242,0.1)]'
        }`}
      />
    )}
  </div>
);
