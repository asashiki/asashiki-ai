// 极轻量的 HTML5 drag helper —— 不依赖第三方库
// 用法：onDragStart={dragStart("skill", id)} ；
//      onDrop={dragDrop("skill", (id) => move(id, to))}

export const dragStart = (kind: string, id: string) =>
  (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-asashiki", `${kind}:${id}`);
    e.currentTarget.classList.add("dragging");
  };

export const dragEnd = (e: React.DragEvent) => {
  e.currentTarget.classList.remove("dragging");
};

export const dragOver = (kind: string) =>
  (e: React.DragEvent) => {
    const t = e.dataTransfer.types;
    if (!t.includes("application/x-asashiki")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    e.currentTarget.classList.add("drag-over");
  };

export const dragLeave = (e: React.DragEvent) => {
  e.currentTarget.classList.remove("drag-over");
};

export const dragDrop = (kind: string, handler: (id: string) => void) =>
  (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");
    const raw = e.dataTransfer.getData("application/x-asashiki");
    if (!raw) return;
    const [k, id] = raw.split(":");
    if (k !== kind || !id) return;
    handler(id);
  };
