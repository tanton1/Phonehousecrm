const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Add spareParts to state
const stateReplacement = `  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>(() => {
    return INITIAL_WAREHOUSES;
  });

  const [spareParts, setSpareParts] = useState<SparePart[]>([]);`;
code = code.replace("  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>(() => {\n    return INITIAL_WAREHOUSES;\n  });", stateReplacement);

// Add imports
const importsToReplace = `  subscribeToStoreSettings,
  saveStoreSettingsToFirestore
} from './services/firestoreService';`;
const importsReplacement = `  subscribeToStoreSettings,
  saveStoreSettingsToFirestore,
  subscribeToSpareParts,
  updateSparePartInFirestore
} from './services/firestoreService';`;
code = code.replace(importsToReplace, importsReplacement);

const typeImportsToReplace = `  WarehouseInfo,
  StoreSettings
} from './types';`;
const typeImportsReplacement = `  WarehouseInfo,
  StoreSettings,
  SparePart
} from './types';`;
code = code.replace(typeImportsToReplace, typeImportsReplacement);

// Add subscription
const subToReplace = `    const unsubStoreSettings = subscribeToStoreSettings(setStoreSettings);

    return () => {`;
const subReplacement = `    const unsubStoreSettings = subscribeToStoreSettings(setStoreSettings);
    const unsubSpareParts = subscribeToSpareParts(setSpareParts);

    return () => {
      unsubSpareParts();`;
code = code.replace(subToReplace, subReplacement);

// Pass down to WarrantyServiceView
const propToReplace = `          <WarrantyServiceView
            warrantyTickets={filteredWarrantyTickets}
            devices={filteredDevices}
            funds={funds}
            users={users}`;
const propReplacement = `          <WarrantyServiceView
            warrantyTickets={filteredWarrantyTickets}
            devices={filteredDevices}
            funds={funds}
            users={users}
            spareParts={spareParts}
            onUpdateSparePart={(updatedPart) => updateSparePartInFirestore(updatedPart)}`;
code = code.replace(propToReplace, propReplacement);

fs.writeFileSync('src/App.tsx', code);
