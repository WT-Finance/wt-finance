// Carrega .env.local para os testes de CONTRATO (que batem nas RPCs via REST).
// Os testes de contrato usam describe.skipIf — sem credenciais, são pulados
// (o gate `npm test` permanece verde offline; rodam quando há .env.local).
import { config } from 'dotenv'
config({ path: '.env.local' })
