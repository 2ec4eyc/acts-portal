export const ActsLogo = ({ className = "", imgClassName = "w-full h-full object-contain" }: { className?: string, imgClassName?: string }) => (
  <div className={`block ${className}`}>
    <img src='https://i.postimg.cc/N20vMztm/ACTS-Logo.png' alt='ACTS-Logo' className={imgClassName} />
  </div>
);
