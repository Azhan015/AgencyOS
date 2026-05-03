interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

const sizes = {
  sm: { img: 'h-6 w-6', text: 'text-base' },
  md: { img: 'h-8 w-8', text: 'text-lg' },
  lg: { img: 'h-10 w-10', text: 'text-xl' },
};

export function Logo({ size = 'md', showText = true, className = '' }: LogoProps) {
  const s = sizes[size];
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src="/agencyOS.jpg"
        alt="Agency OS"
        className={`${s.img} rounded-lg object-cover flex-shrink-0`}
      />
      {showText && (
        <span className={`font-bold tracking-tight ${s.text}`}>Agency OS</span>
      )}
    </div>
  );
}
