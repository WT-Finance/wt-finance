import pkg from '../../package.json';
const [major, minor, patch] = (pkg.version as string).split('.')
export const APP_VERSION: string = `${major}.${minor}.${patch}`
