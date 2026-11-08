// A small 65C02 disassembler for reading firmware and programs.
// Usage: node scripts/bbk/d65.mjs <file> <file offset, hex> <CPU address, hex> <instructions>
import fs from "node:fs";
const M = {};
const def=(s)=>s.trim().split(/\s+/).forEach(t=>{const [o,m,a]=t.split(":");M[parseInt(o,16)]=[m,a||"imp"];});
def(`00:BRK 01:ORA:izx 05:ORA:zp 06:ASL:zp 08:PHP 09:ORA:imm 0a:ASL 0d:ORA:abs 0e:ASL:abs 10:BPL:rel 11:ORA:izy 12:ORA:izp 15:ORA:zpx 18:CLC 19:ORA:aby 1a:INC 1d:ORA:abx
20:JSR:abs 21:AND:izx 24:BIT:zp 25:AND:zp 26:ROL:zp 28:PLP 29:AND:imm 2a:ROL 2c:BIT:abs 2d:AND:abs 30:BMI:rel 31:AND:izy 32:AND:izp 38:SEC 3a:DEC 3d:AND:abx 39:AND:aby
40:RTI 45:EOR:zp 46:LSR:zp 48:PHA 49:EOR:imm 4a:LSR 4c:JMP:abs 4d:EOR:abs 50:BVC:rel 51:EOR:izy 58:CLI 5a:PHY
60:RTS 64:STZ:zp 65:ADC:zp 66:ROR:zp 68:PLA 69:ADC:imm 6a:ROR 6c:JMP:ind 6d:ADC:abs 70:BVS:rel 71:ADC:izy 72:ADC:izp 78:SEI 7a:PLY 7c:JMP:iax 7d:ADC:abx 79:ADC:aby
80:BRA:rel 84:STY:zp 85:STA:zp 86:STX:zp 88:DEY 8a:TXA 8c:STY:abs 8d:STA:abs 8e:STX:abs 90:BCC:rel 91:STA:izy 92:STA:izp 94:STY:zpx 95:STA:zpx 98:TYA 99:STA:aby 9a:TXS 9c:STZ:abs 9d:STA:abx 9e:STZ:abx
a0:LDY:imm a2:LDX:imm a4:LDY:zp a5:LDA:zp a6:LDX:zp a8:TAY a9:LDA:imm aa:TAX ac:LDY:abs ad:LDA:abs ae:LDX:abs b0:BCS:rel b1:LDA:izy b2:LDA:izp b4:LDY:zpx b5:LDA:zpx b9:LDA:aby bd:LDA:abx ba:TSX bc:LDY:abx be:LDX:aby
c0:CPY:imm c4:CPY:zp c5:CMP:zp c6:DEC:zp c8:INY c9:CMP:imm ca:DEX cc:CPY:abs cd:CMP:abs ce:DEC:abs d0:BNE:rel d1:CMP:izy d8:CLD da:PHX dd:CMP:abx d9:CMP:aby
e0:CPX:imm e4:CPX:zp e5:SBC:zp e6:INC:zp e8:INX e9:SBC:imm ea:NOP ec:CPX:abs ed:SBC:abs ee:INC:abs f0:BEQ:rel f1:SBC:izy f8:SED fa:PLX fd:SBC:abx f9:SBC:aby`);
const LEN={imp:1,imm:2,zp:2,zpx:2,izx:2,izy:2,izp:2,rel:2,abs:3,abx:3,aby:3,ind:3,iax:3};
const [,, file, off, addr, count] = process.argv;
const g = fs.readFileSync(file); let o = parseInt(off,16), pc = parseInt(addr,16);
for (let n=0;n<+count;n++){ const op=g[o]; const [m,a]=M[op]||["???","imp"]; const l=LEN[a]; const b1=g[o+1], w=g[o+1]|(g[o+2]<<8);
  const h=(v,d)=>"$"+v.toString(16).padStart(d,"0");
  const arg={imp:"",imm:"#"+h(b1,2),zp:h(b1,2),zpx:h(b1,2)+",x",izx:"("+h(b1,2)+",x)",izy:"("+h(b1,2)+"),y",izp:"("+h(b1,2)+")",rel:h((pc+2+((b1<<24)>>24))&0xffff,4),abs:h(w,4),abx:h(w,4)+",x",aby:h(w,4)+",y",ind:"("+h(w,4)+")",iax:"("+h(w,4)+",x)"}[a];
  console.log(pc.toString(16).padStart(4,"0")+"  "+[...g.subarray(o,o+l)].map(x=>x.toString(16).padStart(2,"0")).join(" ").padEnd(9)+" "+m+" "+arg);
  o+=l; pc+=l; }
