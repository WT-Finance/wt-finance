import Badge from '@/components/ui/badge'
import type { LivroLista } from './tipos'

// Pill de estado do exemplar. Dois estados só (a Estante não tem manutenção nem baixa,
// diferente do Inventário de Ativos). Cor pela variante semântica do primitivo <Badge>
// (molde: status-badge.tsx do Inventário) — nunca hex, nunca classe de cor crua (lint
// wt/no-cor-hardcoded). `--warning-soft` não existe em tokens.css (só `--positive-soft`),
// e o brief autoriza usar "o equivalente que status-badge.tsx já usa" nesse caso: as
// variantes prontas do <Badge> resolvem os dois estados sem precisar de token novo.
export default function EstadoBadge({ livro }: { livro: LivroLista }) {
  return livro.emprestado
    ? <Badge variant="warning">Emprestado</Badge>
    : <Badge variant="success">Disponível</Badge>
}
