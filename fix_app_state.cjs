const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const toReplace = `  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>(() => {
    const saved = localStorage.getItem('phonehouse_warehouses');
    return saved ? JSON.parse(saved) : INITIAL_WAREHOUSES;
  });`;

const replacement = `  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>(() => {
    const saved = localStorage.getItem('phonehouse_warehouses');
    return saved ? JSON.parse(saved) : INITIAL_WAREHOUSES;
  });

  const [spareParts, setSpareParts] = useState<SparePart[]>([]);`;

code = code.replace(toReplace, replacement);
fs.writeFileSync('src/App.tsx', code);
