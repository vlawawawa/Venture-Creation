"use strict";
// Shared DOM lookup, currency formatting, and HTML escaping helpers.
const $ = (id) => document.getElementById(id),
  rupiah = (n) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(n),
  esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
// Session-only state. Quantities in buy and use share the row's unit.
let ingredients = [
    { name: "Ayam", unit: "g", buy: 1000, price: 40000, use: 1500 },
    { name: "Beras", unit: "g", buy: 1000, price: 15000, use: 1000 },
    { name: "Minyak", unit: "ml", buy: 1000, price: 30000, use: 200 },
    { name: "Sambal", unit: "g", buy: 1000, price: 30000, use: 300 },
    { name: "Kemasan", unit: "pcs", buy: 1, price: 500, use: 10 },
  ],
  records = [],
  current = null;
/**
 * Calculate recipe costs without changing state or the DOM.
 * Margin is a percentage of selling price; recommendation rounds up to Rp500.
 * @param {Array<{name: string, unit: string, buy: number, price: number, use: number}>} rows
 * @param {number} servings Positive integer portion count.
 * @param {number} extra Additional production costs per batch, in rupiah.
 * @param {number} margin Target percentage, from 0 up to but excluding 100.
 * @param {number} selling Selling price per portion, in rupiah.
 * @returns {{batch: number, hpp: number, recommended: number, contribution: number, actual: number}}
 * @throws {Error} When recipe inputs are invalid.
 */
function calculate(rows, servings, extra, margin, selling) {
  if (
    !rows.length ||
    !Number.isInteger(servings) ||
    servings <= 0 ||
    ![extra, margin, selling].every(Number.isFinite) ||
    extra < 0 ||
    margin < 0 ||
    margin >= 100 ||
    selling <= 0 ||
    rows.some(
      (r) =>
        !r.name.trim() ||
        ![r.buy, r.price, r.use].every(Number.isFinite) ||
        r.buy <= 0 ||
        r.price < 0 ||
        r.use < 0,
    )
  )
    throw Error(
      "Lengkapi bahan, jumlah beli > 0, porsi bilangan bulat > 0, harga jual > 0, dan margin 0–99%.",
    );
  const batch = rows.reduce((s, r) => s + (r.price / r.buy) * r.use, extra),
    hpp = batch / servings;
  return {
    batch,
    hpp,
    recommended: Math.ceil(hpp / (1 - margin / 100) / 500) * 500,
    contribution: selling - hpp,
    actual: ((selling - hpp) / selling) * 100,
  };
}
// Rebuild editable rows after adding or removing an ingredient.
function renderIngredients() {
  const fieldLabels = {
    name: "Nama bahan",
    buy: "Kuantitas beli",
    price: "Harga beli",
    use: "Pemakaian",
  };

  $("ingredients").innerHTML = ingredients
    .map((ingredient, index) => {
      const cells = ["name", "unit", "buy", "price", "use"]
        .map((key) => {
          if (key === "unit") {
            const options = ["g", "ml", "pcs"]
              .map(
                (unit) =>
                  `<option ${ingredient.unit === unit ? "selected" : ""}>${unit}</option>`,
              )
              .join("");
            return `<td><select data-i="${index}" data-key="unit"
          aria-label="Satuan ${esc(ingredient.name)}">${options}</select></td>`;
          }

          const constraints =
            key === "name"
              ? 'maxlength="80"'
              : `type="number" min="${key === "buy" ? "0.01" : "0"}" step="any"`;
          return `<td><input aria-label="${fieldLabels[key]} baris ${index + 1}"
        data-i="${index}" data-key="${key}" ${constraints}
        value="${esc(ingredient[key])}"></td>`;
        })
        .join("");

      return `<tr>${cells}
      <td><span class="cost" id="cost-${index}"></span></td>
      <td><button class="delete" data-remove="${index}"
        aria-label="Hapus ${esc(ingredient.name)}">&times;</button></td>
    </tr>`;
    })
    .join("");
  update();
}
// Refresh calculation outputs, or clear stale results when validation fails.
function update() {
  try {
    current = calculate(
      ingredients,
      Number($("servings").value),
      Number($("extra").value),
      Number($("margin").value),
      Number($("selling").value),
    );
    if (!$("menu").value.trim()) throw Error("Isi nama menu.");
    $("calcError").textContent = "";
    $("hpp").textContent = rupiah(current.hpp);
    $("batchCost").textContent = rupiah(current.batch);
    $("recommended").textContent = rupiah(current.recommended);
    $("marginLabel").textContent = $("margin").value + "%";
    $("contribution").textContent = rupiah(current.contribution);
    $("actualMargin").textContent = current.actual.toFixed(1) + "%";
    ingredients.forEach(
      (r, i) =>
        ($("cost-" + i).textContent = rupiah((r.price / r.buy) * r.use)),
    );
  } catch (e) {
    current = null;
    $("calcError").textContent = e.message;
    [
      "hpp",
      "batchCost",
      "recommended",
      "marginLabel",
      "contribution",
      "actualMargin",
    ].forEach((id) => ($(id).textContent = "—"));
    ingredients.forEach((r, i) => ($("cost-" + i).textContent = "—"));
  }
}
// Delegate row events to the table body so newly rendered inputs work too.
$("ingredients").addEventListener("input", (e) => {
  if (e.target.dataset.key) {
    const { i, key } = e.target.dataset;
    ingredients[i][key] = ["name", "unit"].includes(key)
      ? e.target.value
      : e.target.value === ""
        ? NaN
        : Number(e.target.value);
    update();
  }
});
$("ingredients").addEventListener("click", (e) => {
  if (e.target.dataset.remove !== undefined) {
    ingredients.splice(Number(e.target.dataset.remove), 1);
    renderIngredients();
  }
});
$("addIngredient").onclick = () => {
  ingredients.push({
    name: "Bahan baru",
    unit: "g",
    buy: 1000,
    price: 0,
    use: 0,
  });
  renderIngredients();
};
["menu", "servings", "extra", "margin", "selling"].forEach((id) =>
  $(id).addEventListener("input", update),
);
// Navigation keeps visible panels and accessibility state in sync.
document.querySelectorAll(".tab").forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll(".tab").forEach((x) => {
        x.classList.toggle("active", x === b);
        if (x === b) x.setAttribute("aria-current", "page");
        else x.removeAttribute("aria-current");
      });
      document
        .querySelectorAll(".panel")
        .forEach((p) => (p.hidden = p.id !== b.dataset.tab));
      if (b.dataset.tab === "report") renderReport();
    }),
);
// Use local calendar dates instead of UTC conversion for date inputs.
const today = new Date(),
  isoDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
["saleDate", "wasteDate", "reportDate"].forEach(
  (id) => ($(id).value = isoDate(today)),
);
// Render all session records and refresh the report after each change.
function renderLog() {
  $("log").innerHTML = records.length
    ? records
        .map(
          (r, i) =>
            `<tr><td>${esc(r.date)}</td><td>${r.type === "sale" ? "Penjualan" : "Waste"}</td><td>${esc(r.name)}${r.reason ? "<small>" + esc(r.reason) + "</small>" : ""}</td><td>${r.qty} ${esc(r.unit)}</td><td>${rupiah(r.qty * r.cost)}</td><td><button class="delete" data-record="${i}" aria-label="Hapus catatan ${esc(r.name)}">Hapus</button></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="6">Belum ada catatan. Tambahkan penjualan atau waste pertama kamu.</td></tr>';
  renderReport();
}
$("log").onclick = (e) => {
  if (e.target.dataset.record !== undefined) {
    records.splice(Number(e.target.dataset.record), 1);
    renderLog();
    $("notice").textContent = "Catatan dihapus.";
  }
};
// Snapshot the price and HPP: later recipe edits must not rewrite past sales.
$("saleForm").onsubmit = (e) => {
  e.preventDefault();
  update();
  if (!current) {
    $("notice").textContent =
      "Perbaiki resep pada tab Resep & HPP terlebih dahulu.";
    return;
  }
  records.push({
    date: $("saleDate").value,
    type: "sale",
    name: $("menu").value.trim(),
    qty: Number($("saleQty").value),
    unit: "porsi",
    cost: Number($("selling").value),
    hpp: current.hpp,
    reason: "",
  });
  renderLog();
  $("notice").textContent =
    "Penjualan dicatat. HPP dan harga jual disimpan sesuai nilai saat ini.";
};
// Waste cost is per selected unit; total loss is quantity multiplied by cost.
$("wasteForm").onsubmit = (e) => {
  e.preventDefault();
  if (!$("wasteName").value.trim()) {
    $("wasteName").focus();
    return;
  }
  records.push({
    date: $("wasteDate").value,
    type: "waste",
    name: $("wasteName").value.trim(),
    qty: Number($("wasteQty").value),
    unit: $("wasteUnit").value,
    cost: Number($("wasteCost").value),
    reason: $("wasteReason").value,
  });
  renderLog();
  $("notice").textContent =
    "Waste dicatat. Lihat ringkasan untuk menentukan bahan yang perlu dievaluasi.";
};
// Include the selected date plus six preceding days; group waste by name.
function reportData() {
  const end = $("reportDate").value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const d = new Date(end + "T12:00:00");
  d.setDate(d.getDate() - 6);
  const start = isoDate(d),
    selected = records.filter((r) => r.date >= start && r.date <= end);
  const sales = selected.filter((r) => r.type === "sale"),
    waste = selected.filter((r) => r.type === "waste"),
    map = new Map();
  waste.forEach((r) => {
    const key = r.name.toLocaleLowerCase("id-ID"),
      old = map.get(key) || { name: r.name, total: 0 };
    old.total += r.qty * r.cost;
    map.set(key, old);
  });
  return {
    start,
    end,
    revenue: sales.reduce((s, r) => s + r.qty * r.cost, 0),
    portions: sales.reduce((s, r) => s + r.qty, 0),
    total: waste.reduce((s, r) => s + r.qty * r.cost, 0),
    ranking: [...map.values()].sort((a, b) => b.total - a.total),
  };
}
// Present the aggregate values and the highest-value waste group.
function renderReport() {
  const data = reportData();
  if (!data) return;
  $("period").textContent =
    `Periode ${data.start} sampai ${data.end} · hanya catatan yang kamu masukkan.`;
  $("revenue").textContent = rupiah(data.revenue);
  $("portions").textContent = data.portions;
  $("wasteTotal").textContent = rupiah(data.total);
  $("ranking").innerHTML = data.ranking.length
    ? data.ranking
        .map(
          (r) =>
            `<div class="rank"><div><span>${esc(r.name)}</span><strong>${rupiah(r.total)}</strong></div><div class="bar"><i style="width:${data.total ? (r.total / data.total) * 100 : 0}%"></i></div></div>`,
        )
        .join("")
    : '<p class="help">Belum ada waste dalam periode ini.</p>';
  const top = data.ranking[0];
  $("insightTitle").textContent = top
    ? `Evaluasi ${top.name} lebih dulu.`
    : "Mulai dari catatan pertama.";
  $("insightText").textContent = top
    ? `Nilai terbuang ${rupiah(top.total)}${data.total ? ", yaitu " + ((top.total / data.total) * 100).toFixed(0) + "% dari total waste tercatat" : ""}. Periksa alasan pembuangan sebelum mengubah pembelian atau produksi.`
    : "Catat bahan terbuang untuk melihat prioritas evaluasi pembelian.";
}
$("reportDate").onchange = renderReport;
// Export every session record, including records outside the report period.
// Quote CSV cells and prefix common spreadsheet formula markers.
$("export").onclick = () => {
  const cell = (v) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@-]/, "'$&")
        .replace(/"/g, '""') +
      '"',
    rows = [
      [
        "tanggal",
        "jenis",
        "menu_atau_bahan",
        "jumlah",
        "satuan",
        "harga_jual_atau_biaya_satuan_Rp",
        "nilai_total_Rp",
        "HPP_snapshot_per_porsi_Rp",
        "alasan",
      ],
      ...records.map((r) => [
        r.date,
        r.type === "sale" ? "penjualan" : "waste",
        r.name,
        r.qty,
        r.unit,
        r.cost,
        r.qty * r.cost,
        r.hpp ?? "",
        r.reason,
      ]),
    ];
  const blob = new Blob(
    ["\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "kitchenseal-catatan.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
// Ask the browser to warn before session records are discarded.
window.addEventListener("beforeunload", (e) => {
  if (records.length) {
    e.preventDefault();
    e.returnValue = "";
  }
});
// Initial render after the HTML has loaded.
renderIngredients();
renderLog();
// Optional browser integration; registration failure must not prevent UI use.
if (document.modelContext?.registerTool) {
  try {
    Promise.resolve(
      document.modelContext.registerTool({
        name: "read_recipe_calculation",
        title: "Baca perhitungan HPP",
        description:
          "Membaca perhitungan resep yang sedang terlihat tanpa mengubah data.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute(input) {
          if (input && Object.keys(input).length)
            throw Error("Tidak menerima parameter.");
          update();
          if (!current) throw Error("Resep belum valid.");
          return { menu: $("menu").value, ...current };
        },
      }),
    ).catch(() => {});
  } catch {}
}
