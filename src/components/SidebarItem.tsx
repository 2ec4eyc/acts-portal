export const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick: () => void }) => (
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
    </button>
  </div>
);
