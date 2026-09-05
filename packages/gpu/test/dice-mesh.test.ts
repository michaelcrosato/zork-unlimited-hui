import { describe, expect, it } from "vitest";
import { diceMesh, faceOrientation, rotateBy } from "../src/dice-mesh.ts";

describe.each([6,20] as const)("physical d%i",sides=>{
  const mesh=diceMesh(sides);
  it("has one unique, outward-facing numbered face per result",()=>{
    expect(new Set(mesh.faces.map(f=>f.value)).size).toBe(sides);
    expect(mesh.vertices.length/12).toBe(sides===6?36:60);
    for(let i=0;i<mesh.vertices.length;i+=12) {
      const v=mesh.vertices;
      expect(v[i]!*v[i+3]!+v[i+1]!*v[i+4]!+v[i+2]!*v[i+5]!).toBeGreaterThan(0);
      expect(v[i+9]!+v[i+10]!+v[i+11]!).toBe(1);
    }
  });
  for(let value=1;value<=sides;value++) it(`reveals ${value} toward the viewer, upright`,()=>{
    const face=mesh.faces.find(f=>f.value===value)!;
    const q=faceOrientation(mesh,value);
    const n=rotateBy(q,face.normal),up=rotateBy(q,face.up);
    [0,0,1].forEach((v,i)=>expect(n[i]).toBeCloseTo(v,6));
    [0,1,0].forEach((v,i)=>expect(up[i]).toBeCloseTo(v,6));
  });
});
