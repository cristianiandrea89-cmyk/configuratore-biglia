const variants = {
  primary: 'bg-bronze text-dgray font-medium px-6 py-3 rounded-sm hover:bg-bronze/90 transition-colors',
  secondary: 'border border-gray/40 text-dgray px-6 py-3 rounded-sm hover:border-bronze hover:text-bronze transition-colors',
}

export default function Button({ variant = 'primary', className = '', ...props }) {
  return <button className={`${variants[variant]} ${className}`} {...props} />
}
