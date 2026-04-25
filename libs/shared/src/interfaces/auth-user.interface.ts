export interface IAuthUser {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  tokenVersion: number;
}
