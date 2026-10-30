const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 10000;
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
const films = JSON.parse(fs.readFileSync(path.join(__dirname, "catalog.json"), "utf8"));
app.get("/", (_req, res) => res.type("text").send("La gran videoteca del cine boliviano está activa. Abre /manifest.json para instalar el complemento."));
app.get("/manifest.json", (_req, res) => res.json(manifest));
app.get("/catalog/movie/cine_boliviano.json", (req, res) => {
  const q = String(req.query.search || "").toLocaleLowerCase("es");
  const metas = films.filter(f => !q || f.title.toLocaleLowerCase("es").includes(q) || String(f.year).includes(q))
    .map(f => ({ id:f.id, type:"movie", name:f.title, releaseInfo:String(f.year), poster:null, description:`${f.type || "Cine"} · Dirección: ${f.director || "Dato no disponible"}${f.notes ? "\n"+f.notes : ""}` }));
  res.json({ metas });
});
app.get("/meta/movie/:id.json", (req, res) => {
  const f = films.find(x => x.id === req.params.id);
  if (!f) return res.status(404).json({ error:"No encontrado" });
  res.json({ meta:{ id:f.id, type:"movie", name:f.title, releaseInfo:String(f.year), poster:null, description:`${f.type || "Cine"} · Dirección: ${f.director || "Dato no disponible"}${f.notes ? "\n"+f.notes : ""}` } });
});
app.listen(PORT, () => console.log(`Addon activo en puerto ${PORT}`));
