import type { NextFunction, Request, Response } from 'express';
import { db } from '../db.ts';
import { verifyJwt } from '../utils/crypto.ts';

export interface AuthenticatedUser {
  userId: number;
  fullName: string;
  email: string;
  role: string;
  businessId: number | null;
  businessName: string | null;
  businessStatus: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

interface UserLookupRow {
  UserId: number;
  FullName: string;
  Email: string;
  IsActive: number;
  GlobalRole: string | null;
  BizRole: string | null;
  BusinessId: number | null;
  BusinessName: string | null;
  BusinessStatus: string | null;
}

export function getUserAuthContextById(userId: number): AuthenticatedUser | null {
  const row = db
    .prepare(
      `SELECT
        u.UserId,
        u.FullName,
        u.Email,
        u.IsActive,
        (SELECT r.Name FROM UserRoles ur JOIN Roles r ON ur.RoleId = r.RoleId WHERE ur.UserId = u.UserId LIMIT 1) AS GlobalRole,
        (SELECT r2.Name FROM BusinessUsers bu2 JOIN Roles r2 ON bu2.RoleId = r2.RoleId WHERE bu2.UserId = u.UserId ORDER BY bu2.IsPrimaryOwner DESC, bu2.BusinessUserId ASC LIMIT 1) AS BizRole,
        bu.BusinessId,
        b.Name AS BusinessName,
        b.Status AS BusinessStatus
      FROM Users u
      LEFT JOIN BusinessUsers bu ON bu.UserId = u.UserId
      LEFT JOIN Businesses b ON b.BusinessId = bu.BusinessId
      WHERE u.UserId = ?
      ORDER BY bu.IsPrimaryOwner DESC, bu.BusinessUserId ASC
      LIMIT 1`
    )
    .get(userId) as UserLookupRow | undefined;

  if (!row || row.IsActive !== 1) return null;

  const role = row.GlobalRole || row.BizRole || '';
  if (!role) return null;

  return {
    userId: row.UserId,
    fullName: row.FullName,
    email: row.Email,
    role,
    businessId: row.BusinessId ?? null,
    businessName: row.BusinessName ?? null,
    businessStatus: row.BusinessStatus ?? null,
  };
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  const token = authHeader.slice(7).trim();
  const payload = verifyJwt(token);
  if (!payload) {
    res.status(401).json({ success: false, message: 'Invalid or expired access token.' });
    return;
  }

  const user = getUserAuthContextById(payload.sub);
  if (!user) {
    res.status(401).json({ success: false, message: 'Account is inactive or unavailable.' });
    return;
  }

  if (user.role !== 'SuperAdmin' && user.businessId !== null && user.businessStatus !== 'Active') {
    res.status(403).json({
      success: false,
      message: `Business workspace is currently ${user.businessStatus}. Please contact platform support.`,
    });
    return;
  }

  req.user = user;
  next();
}

export function requireRoles(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions for this resource.' });
      return;
    }
    next();
  };
}
