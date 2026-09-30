/**
 * Canal simples para a Tela de Usuários devolver a seleção de integrantes
 * à Tela de Criação/Edição de Grupo, sem serializar listas nos parâmetros de navegação.
 */
let pendingSelection: readonly string[] | null = null;

export function setPendingMemberSelection(memberIds: readonly string[]): void {
  pendingSelection = [...memberIds];
}

export function consumePendingMemberSelection(): readonly string[] | null {
  const selection = pendingSelection;
  pendingSelection = null;
  return selection;
}
