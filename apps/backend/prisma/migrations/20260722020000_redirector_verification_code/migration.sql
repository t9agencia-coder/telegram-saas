-- Código de 5 dígitos por redirecionador — camada extra de verificação no
-- cloaker (?app=), combinada (E lógico) com a verificação por plataforma que
-- já existe (fbclid/click_id). Desligado por padrão em links já existentes
-- (rules.verificationCodeEnabled ausente) para não quebrar campanhas ativas;
-- o código em si é gerado pra todos, só fica esperando ser ativado.

ALTER TABLE "Redirector" ADD COLUMN IF NOT EXISTS "verificationCode" TEXT;
UPDATE "Redirector" SET "verificationCode" = lpad(floor(random()*90000+10000)::text, 5, '0')
  WHERE "verificationCode" IS NULL;
ALTER TABLE "Redirector" ALTER COLUMN "verificationCode" SET NOT NULL;
