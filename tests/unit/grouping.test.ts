import { describe, expect, it } from "vitest";
import { proposeGroups, type LayoutItem } from "../../src/core/grouping.js";

const canvas = { width: 1080, height: 1350 };
let n = 0;
const L = (kind: LayoutItem["kind"], name: string, b: [number, number, number, number]): LayoutItem => ({ id: ++n, name, kind, bounds: b });

describe("semantic grouping", () => {
  it("icon + text rows of a list: one item group each, all inside one list group", () => {
    const items = [
      L("text", "Edita no Photoshop", [160, 500, 700, 540]),
      L("shape", "icone 1", [100, 500, 140, 540]),
      L("text", "Anima no After", [160, 580, 640, 620]),
      L("shape", "icone 2", [100, 580, 140, 620]),
      L("text", "Exporta tudo", [160, 660, 600, 700]),
      L("shape", "icone 3", [100, 660, 140, 700]),
      L("pixel", "fundo", [0, 0, 1080, 1350])
    ];
    const r = proposeGroups(items, canvas);
    expect(r.proposals).toHaveLength(1);
    const list = r.proposals[0];
    expect(list.name).toBe("Lista (3 itens)");
    expect(list.children.map((c) => c.name)).toEqual(["Item – Edita no Photoshop", "Item – Anima no After", "Item – Exporta tudo"]);
    expect(list.children.every((c) => c.members.length === 2)).toBe(true);
  });

  it("text on a shape is a label; a lone object and the background stay alone", () => {
    const items = [L("text", "Saiba mais", [420, 1100, 660, 1150]), L("shape", "botao", [380, 1080, 700, 1170]), L("smart", "logo", [440, 80, 640, 200]), L("pixel", "fundo", [0, 0, 1080, 1350])];
    const r = proposeGroups(items, canvas);
    expect(r.proposals.map((p) => p.name)).toEqual(["Rótulo – Saiba mais"]);
    expect(r.proposals[0].members).toHaveLength(2);
  });

  it("buttons side by side form a row of buttons", () => {
    const items = [
      L("text", "Sim", [140, 1100, 300, 1140]),
      L("shape", "b1", [100, 1080, 340, 1160]),
      L("text", "Não", [540, 1100, 700, 1140]),
      L("shape", "b2", [500, 1080, 740, 1160])
    ];
    const r = proposeGroups(items, canvas);
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0].name).toBe("Botões (2 botões)");
    expect(r.proposals[0].role).toBe("row");
  });

  it("icon above a title and its description: one item with the three", () => {
    const items = [
      L("shape", "icone", [500, 300, 580, 380]),
      L("text", "Rápido", [440, 400, 640, 450]),
      L("text", "Entrega em minutos", [440, 460, 760, 500])
    ];
    const r = proposeGroups(items, canvas);
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0].members).toHaveLength(3);
  });

  it("does not group when another overlapping layer sits between the members in the stack", () => {
    const items = [L("text", "Oferta", [420, 1100, 660, 1150]), L("pixel", "brilho por cima do botao", [300, 1000, 800, 1200]), L("shape", "botao", [380, 1080, 700, 1170])];
    const r = proposeGroups(items, canvas);
    expect(r.proposals).toHaveLength(0);
    expect(r.skipped[0].name).toContain("Oferta");
  });

  it("a big text block over a big photo is not a label", () => {
    const items = [L("text", "Titulo", [100, 100, 980, 300]), L("pixel", "foto", [0, 0, 1080, 1000])];
    expect(proposeGroups(items, canvas).proposals).toHaveLength(0);
  });
});

import { planTree } from "../../src/core/grouping.js";

describe("planTree (Illustrator layers, InDesign pages)", () => {
  it("looks inside each layer and names the container", () => {
    const r = planTree(
      [
        {
          id: "layer:0",
          name: "Camada 1",
          kind: "group",
          bounds: null,
          children: [
            { id: "a", name: "", kind: "text", text: "Comprar", bounds: [420, 1100, 660, 1150] },
            { id: "b", name: "", kind: "shape", bounds: [380, 1080, 700, 1170] }
          ]
        }
      ],
      canvas
    );
    expect(r.plans).toEqual([{ container: "/Camada 1", proposals: [expect.objectContaining({ name: "Rótulo – Comprar", members: ["a", "b"] })] }]);
  });
});
