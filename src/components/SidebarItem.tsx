export const SidebarItem = ({ icon: Icon, label, active, onClick, badge }: { icon: any, label: string, active?: boolean, onClick: () => void, badge?: number }) => (
  <div className="px-2">
    <button 
      onClick={onClick}
      className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
        active 
        ? 'active-sidebar-item' 
        : 'text-fb-textSecondary hover:bg-fb-hover'
      }`}
    >
      <div className={`p-2 rounded-full ${active ? 'bg-transparent' : 'bg-fb-hover group-hover:bg-gray-200'}`}>
        <Icon size={20} className={active ? 'text-fb-blue' : 'text-fb-textPrimary'} />
      </div>
      <span className={`font-semibold text-sm ${active ? 'text-fb-blue' : 'text-fb-textPrimary'}`}>{label}</span>
      {!!badge && <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-fb-blue text-white text-[10px] font-black flex items-center justify-center" aria-label={`${badge} unread`}>{badge > 99 ? '99+' : badge}</span>}
    </button>
  </div>
);
