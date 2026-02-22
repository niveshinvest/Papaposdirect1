
import React from 'react';
import { User, UserRole } from '../types';

interface PermissionGateProps {
  currentUser: User | null;
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const PermissionGate: React.FC<PermissionGateProps> = ({ 
  currentUser, 
  allowedRoles, 
  children, 
  fallback = null 
}) => {
  if (!currentUser) return null;
  
  const hasPermission = allowedRoles.includes(currentUser.role);

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export default PermissionGate;
