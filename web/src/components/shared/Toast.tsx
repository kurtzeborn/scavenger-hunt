import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationCircle, faCheckCircle, faInfoCircle } from '@fortawesome/free-solid-svg-icons';

interface ToastProps {
  message: string;
  variant?: 'error' | 'success' | 'info';
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, variant = 'info', duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for fade out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const variantStyles = {
    error: {
      bg: 'bg-red-600',
      icon: faExclamationCircle,
    },
    success: {
      bg: 'bg-green-600',
      icon: faCheckCircle,
    },
    info: {
      bg: 'bg-blue-600',
      icon: faInfoCircle,
    },
  };

  const styles = variantStyles[variant];

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
      }`}
    >
      <div className={`${styles.bg} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3`}>
        <FontAwesomeIcon icon={styles.icon} />
        <span className="font-medium">{message}</span>
      </div>
    </div>
  );
}
