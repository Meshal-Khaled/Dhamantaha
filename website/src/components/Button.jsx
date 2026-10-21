import { Link } from 'react-router';

/** One button style for links and buttons alike. Pass `to` for an in-site link, `href` for an outside one. */
export default function Button({ variant = 'primary', size, block, to, href, className = '', children, ...props }) {
  const classes = ['btn', `btn--${variant}`, size && `btn--${size}`, block && 'btn--block', className].filter(Boolean).join(' ');
  if (to) return <Link to={to} className={classes} {...props}>{children}</Link>;
  if (href) return <a href={href} className={classes} {...props}>{children}</a>;
  return <button type="button" className={classes} {...props}>{children}</button>;
}
