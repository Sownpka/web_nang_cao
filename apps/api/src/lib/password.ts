import bcrypt from 'bcryptjs';

const ROUNDS = 10;

// Precomputed hash used to keep login timing similar whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync('judgehint-timing-equalizer', ROUNDS);

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  return bcrypt.compare(plain, hash ?? DUMMY_HASH).then((ok) => ok && !!hash);
}
