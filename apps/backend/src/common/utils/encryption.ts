import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// Sem fallback: uma chave fraca/pública cifrando token de bot e credencial de
// adquirente em produção é pior do que a aplicação recusar subir.
const rawKey = process.env.ENCRYPTION_KEY
if (!rawKey || rawKey.length < 32) {
  throw new Error(
    'ENCRYPTION_KEY ausente ou com menos de 32 caracteres — configure a variável de ambiente antes de iniciar a aplicação.',
  )
}
const ENCRYPTION_KEY = Buffer.from(rawKey, 'utf8').subarray(0, 32)

const ALGORITHM = 'aes-256-cbc'

export function encrypt(text: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':')
  const iv = Buffer.from(parts[0], 'hex')
  const encrypted = Buffer.from(parts[1], 'hex')
  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}
