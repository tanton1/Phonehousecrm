const fs = require('fs');
let code = fs.readFileSync('src/components/POSSalesView.tsx', 'utf-8');

// Replace mock states
code = code.replace(
  "const [customerName, setCustomerName] = useState('Nguyễn Văn Tuấn');",
  "const [customerName, setCustomerName] = useState('');"
);
code = code.replace(
  "const [customerPhone, setCustomerPhone] = useState('0909 123 456');",
  "const [customerPhone, setCustomerPhone] = useState('');"
);
code = code.replace(
  "const [customerAddress, setCustomerAddress] = useState('123 Cầu Giấy, Hà Nội');",
  "const [customerAddress, setCustomerAddress] = useState('');"
);
code = code.replace(
  "const [customerType, setCustomerType] = useState<'Thân thiết' | 'VIP' | 'Khách lẻ'>('Thân thiết');",
  "const [customerType, setCustomerType] = useState<'Thân thiết' | 'VIP' | 'Khách lẻ'>('Khách lẻ');"
);
code = code.replace(
  "const [cashGiven, setCashGiven] = useState<number>(35000000);",
  "const [cashGiven, setCashGiven] = useState<number>(0);"
);
code = code.replace(
  "if (preSelectedDevice) return [preSelectedDevice];\n    if (inStockDevices.length > 0) return [inStockDevices[0]];",
  "if (preSelectedDevice) return [preSelectedDevice];\n    "
);

fs.writeFileSync('src/components/POSSalesView.tsx', code, 'utf-8');
