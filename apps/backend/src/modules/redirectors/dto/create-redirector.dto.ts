import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsObject,
  IsInt,
  Max,
  Min,
  ValidateNested,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RedirectorSourcesDto {
  @IsOptional()
  @IsBoolean()
  facebook?: boolean;

  @IsOptional()
  @IsBoolean()
  tiktok?: boolean;

  @IsOptional()
  @IsBoolean()
  kwai?: boolean;

  @IsOptional()
  @IsBoolean()
  google?: boolean;
}

export class RedirectorScheduleDto {
  @IsBoolean()
  enabled: boolean;

  @IsString()
  start: string;

  @IsString()
  end: string;
}

export class RedirectorRulesDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => RedirectorSourcesDto)
  sources?: RedirectorSourcesDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  devices?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  os?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countries?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => RedirectorScheduleDto)
  schedule?: RedirectorScheduleDto;

  @IsOptional()
  @IsString()
  deviceFilter?: string; // 'all' | 'mobile_only'

  @IsOptional()
  @IsBoolean()
  verificationCodeEnabled?: boolean;

  // Modo revisão: enquanto ligado, todo o tráfego vai para a página
  // alternativa, passando por cima dos filtros acima — sem apagá-los. Usado
  // enquanto o anúncio está em análise na plataforma.
  //
  // Precisa estar declarado aqui: o ValidationPipe roda com
  // `forbidNonWhitelisted`, então um campo não declarado faz o salvamento
  // devolver 400 em vez de ser ignorado.
  @IsOptional()
  @IsBoolean()
  reviewMode?: boolean;

  // Desligar a revisão sozinha quando o anúncio for aprovado e começar a
  // trazer gente de verdade.
  @IsOptional()
  @IsBoolean()
  reviewAutoOff?: boolean;

  // Quantas pessoas (IPs distintos) vindas do anúncio precisam chegar antes
  // do desligamento automático.
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(1000)
  reviewAutoOffHits?: number;

  // Quando a revisão foi ligada — marco zero da contagem acima. Quem escreve
  // é o serviço; valor vindo do cliente é sobrescrito. Só é aceito aqui
  // porque o painel devolve o objeto de regras inteiro ao salvar.
  @IsOptional()
  @IsString()
  reviewStartedAt?: string;
}

export class CreateRedirectorDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  flowId?: string;

  @IsOptional()
  @IsString()
  domainId?: string;

  @IsString()
  alternativeUrl: string;

  @IsOptional()
  @IsString()
  destinationType?: string; // 'telegram' | 'external'

  @IsOptional()
  @IsString()
  externalUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RedirectorRulesDto)
  rules?: RedirectorRulesDto;
}

export class UpdateRedirectorDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  flowId?: string;

  @IsOptional()
  @IsString()
  domainId?: string;

  @IsOptional()
  @IsString()
  alternativeUrl?: string;

  @IsOptional()
  @IsString()
  destinationType?: string; // 'telegram' | 'external'

  @IsOptional()
  @IsString()
  externalUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RedirectorRulesDto)
  rules?: RedirectorRulesDto;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResolveRedirectorDto {
  @IsString()
  ua: string;

  @IsString()
  acceptLanguage: string;

  @IsOptional()
  @IsString()
  ip?: string;

  // Cabeçalho Referer — usado só pra classificar origem do tráfego (rede
  // social específica, WhatsApp, direto) quando não há utm_source/click id.
  @IsOptional()
  @IsString()
  referer?: string;

  // --- Parâmetros de clique ---
  @IsOptional()
  @IsString()
  fbclid?: string;

  @IsOptional()
  @IsString()
  ttclid?: string;

  @IsOptional()
  @IsString()
  kwaiId?: string;

  // Código de verificação de 5 dígitos por link (?app= na URL) — checado
  // junto com a verificação de plataforma quando rules.verificationCodeEnabled.
  @IsOptional()
  @IsString()
  verificationCode?: string;

  // --- UTM ---
  @IsOptional()
  @IsString()
  utmSource?: string;

  @IsOptional()
  @IsString()
  utmMedium?: string;

  @IsOptional()
  @IsString()
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  utmContent?: string;

  @IsOptional()
  @IsString()
  utmTerm?: string;

  // --- Cookies de pixel ---
  @IsOptional()
  @IsString()
  fbp?: string;

  @IsOptional()
  @IsString()
  fbc?: string;

  @IsOptional()
  @IsString()
  ttp?: string;

  @IsOptional()
  @IsString()
  kwaiPixel?: string;
}
