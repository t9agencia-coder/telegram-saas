const FIRST_NAMES = [
  'Ana', 'Beatriz', 'Carlos', 'Daniela', 'Eduardo', 'Fernanda',
  'Gabriel', 'Helena', 'Igor', 'Julia', 'Lucas', 'Mariana',
  'Nicolas', 'Olivia', 'Pedro', 'Rafaela', 'Samuel', 'Tatiane',
  'Vinicius', 'Amanda', 'Bruno', 'Cristina', 'Diego', 'Elaine',
  'Fabricio', 'Gisele', 'Henrique', 'Isabela', 'Joao', 'Kamila',
  'Leandro', 'Monica', 'Nathan', 'Patricia', 'Renato', 'Sandra',
  'Thiago', 'Vanessa', 'Wagner', 'Aline',
]

const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira',
  'Costa', 'Almeida', 'Nascimento', 'Araujo', 'Melo', 'Barbosa',
  'Ribeiro', 'Carvalho', 'Gomes', 'Martins', 'Moreira', 'Cardoso',
  'Teixeira', 'Cavalcanti', 'Dias', 'Vieira', 'Monteiro', 'Correia',
  'Freitas', 'Campos', 'Barros', 'Nunes', 'Mendes', 'Rocha',
]

const EMAIL_DOMAINS = [
  'gmail.com', 'hotmail.com', 'yahoo.com.br', 'outlook.com',
  'icloud.com', 'bol.com.br', 'uol.com.br', 'terra.com.br',
  'globo.com', 'live.com',
]

const PHONE_DDDS = ['11', '21', '31', '41', '51', '61', '71', '81', '91', '27', '19', '15']

function hashId(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

function generateCpf9(base: number): string {
  const num = (base % 1_000_000_000).toString().padStart(9, '0')
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(num[i]) * (10 - i)
  const d1 = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(num[i]) * (11 - i)
  sum += d1 * 2
  const d2 = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  return `${num}${d1}${d2}`
}

export function buildCustomerData(extId: string) {
  const key = extId || `${Date.now()}_${Math.random()}`
  const h = hashId(key)

  const firstName = FIRST_NAMES[h % FIRST_NAMES.length]
  const lastName = LAST_NAMES[(h * 7 + 13) % LAST_NAMES.length]
  const name = `${firstName} ${lastName}`

  const emailLocal = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${h % 999}`
  const emailDomain = EMAIL_DOMAINS[(h * 3 + 7) % EMAIL_DOMAINS.length]
  const email = `${emailLocal}@${emailDomain}`

  const ddd = PHONE_DDDS[(h * 5 + 3) % PHONE_DDDS.length]
  const phoneNum = ((h * 13 + 7) % 100_000_000).toString().padStart(8, '0')
  const phone = `${ddd}9${phoneNum}`

  const cpf = generateCpf9(h)

  return { name, email, phone, cpf }
}
