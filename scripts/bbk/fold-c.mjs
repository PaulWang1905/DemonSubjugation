// Fold the C compiler's common instruction patterns in a listing from
// os-function.mjs into short pseudo-statements, to read compiled OS code:
// node scripts/bbk/fold-c.mjs <listing> [from address] [to address]
//   L[n] / L16[n]: the byte / word at ($28)+n (locals and arguments)
//   push A / push $20: the runtime's software-stack pushes; pop n
//   call $Exxx: a far call; zp / zp16: zero page; imm: immediates
import fs from "node:fs";
const [file, from = "0000", to = "ffff"] = process.argv.slice(2);
const lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => /^[0-9a-f]{4}  /.test(l));
const ins = lines.map((l) => ({ at: l.slice(0, 4), op: l.slice(6).trim().replace(/\s+;.*$/, "") })).filter((i) => i.at >= from && i.at <= to);
const out = [];
const zp = (s) => s.replace(/^\$00/, "$");
for (let i = 0; i < ins.length; ) {
  const o = (k) => (ins[i + k] ? ins[i + k].op : "");
  const m = (k, re) => o(k).match(re);
  let r;
  // X16 = L16[n]
  if ((r = m(0, /^LDY #\$(..)$/)) && m(1, /^LDA \(\$28\),y$/) && m(2, /^STA \$(..)$/) && m(3, /^INY/) && m(4, /^LDA \(\$28\),y$/) && m(5, /^STA \$(..)$/)) {
    out.push(`${ins[i].at}  $${m(2, /\$(..)/)[1]}16 = L16[${parseInt(r[1], 16)}]`);
    i += 6;
    continue;
  }
  // L16[n] = X16
  if ((r = m(0, /^LDY #\$(..)$/)) && m(1, /^LDA \$(..)$/) && m(2, /^STA \(\$28\),y$/) && m(3, /^INY/) && m(4, /^LDA \$(..)$/) && m(5, /^STA \(\$28\),y$/)) {
    out.push(`${ins[i].at}  L16[${parseInt(r[1], 16)}] = $${m(1, /\$(..)/)[1]}16`);
    i += 6;
    continue;
  }
  // X16 = imm16
  if ((r = m(0, /^LDA #\$(..)$/)) && m(1, /^STA \$00(..)$|^STA \$(..)$/) && m(2, /^LDA #\$(..)$/) && m(3, /^STA \$/)) {
    const a = zp(o(1).slice(4)), b = zp(o(3).slice(4));
    if (parseInt(b.slice(1), 16) === parseInt(a.slice(1), 16) + 1) {
      out.push(`${ins[i].at}  ${a}16 = #$${m(2, /#\$(..)/)[1]}${r[1]}`);
      i += 4;
      continue;
    }
  }
  // Y16 = X16
  if ((r = m(0, /^LDA \$(..)$/)) && m(1, /^STA \$(..)$/) && m(2, /^LDA \$(..)$/) && m(3, /^STA \$(..)$/)) {
    const a = parseInt(r[1], 16), b = parseInt(m(1, /\$(..)/)[1], 16);
    if (parseInt(m(2, /\$(..)/)[1], 16) === a + 1 && parseInt(m(3, /\$(..)/)[1], 16) === b + 1) {
      out.push(`${ins[i].at}  $${m(1, /\$(..)/)[1]}16 = $${r[1]}16`);
      i += 4;
      continue;
    }
  }
  // pop n
  if (o(0) === "PHP" && o(1) === "SEI" && o(2) === "CLC" && o(3) === "LDA $28" && (r = m(4, /^ADC #\$(..)$/)) && o(9) === "PLP") {
    out.push(`${ins[i].at}  pop ${parseInt(r[1], 16)}`);
    i += 10;
    continue;
  }
  if (o(0) === "PHP" && o(1) === "SEI" && o(2) === "SEC" && o(3) === "LDA $28" && (r = m(4, /^SBC #\$(..)$/)) && o(9) === "PLP") {
    out.push(`${ins[i].at}  locals ${parseInt(r[1], 16)}`);
    i += 10;
    continue;
  }
  // far call
  if ((r = m(0, /^LDX #\$(..)$/)) && o(1) === "STX $26" && m(2, /^LDX #\$(..)$/) && o(3) === "STX $27" && o(4) === "JSR $d2f6") {
    out.push(`${ins[i].at}  call $${m(2, /#\$(..)/)[1]}${r[1]}`);
    i += 5;
    continue;
  }
  // A = L[n], L[n] = A
  if ((r = m(0, /^LDY #\$(..)$/)) && m(1, /^LDA \(\$28\),y$/)) {
    out.push(`${ins[i].at}  A = L[${parseInt(r[1], 16)}]`);
    i += 2;
    continue;
  }
  if ((r = m(0, /^LDY #\$(..)$/)) && m(1, /^STA \(\$28\),y$/)) {
    out.push(`${ins[i].at}  L[${parseInt(r[1], 16)}] = A`);
    i += 2;
    continue;
  }
  const op = o(0) === "JSR $daca" ? "push $2016" : o(0) === "JSR $daaa" ? "push A" : o(0);
  out.push(`${ins[i].at}  ${op}`);
  i++;
}
console.log(out.join("\n"));
