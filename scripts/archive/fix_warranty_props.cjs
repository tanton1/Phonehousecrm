const fs = require('fs');
let code = fs.readFileSync('src/components/WarrantyServiceView.tsx', 'utf8');

const importToReplace = `  FundAccount,
  CashTransaction,
  UserAccount
} from '../types';`;
const importReplacement = `  FundAccount,
  CashTransaction,
  UserAccount,
  SparePart
} from '../types';`;
code = code.replace(importToReplace, importReplacement);

const propsToReplace = `  users?: UserAccount[];
  onAddTicket: (ticket: WarrantyTicket) => void;
  onUpdateTicket: (ticket: WarrantyTicket) => void;
  onAddTransaction?: (tx: CashTransaction) => void;
}`;
const propsReplacement = `  users?: UserAccount[];
  spareParts?: SparePart[];
  onAddTicket: (ticket: WarrantyTicket) => void;
  onUpdateTicket: (ticket: WarrantyTicket) => void;
  onUpdateSparePart?: (part: SparePart) => void;
  onAddTransaction?: (tx: CashTransaction) => void;
}`;
code = code.replace(propsToReplace, propsReplacement);

const argsToReplace = `  funds = [],
  users = [],
  onAddTicket,
  onUpdateTicket,
  onAddTransaction
}) => {`;
const argsReplacement = `  funds = [],
  users = [],
  spareParts = [],
  onAddTicket,
  onUpdateTicket,
  onUpdateSparePart,
  onAddTransaction
}) => {`;
code = code.replace(argsToReplace, argsReplacement);

fs.writeFileSync('src/components/WarrantyServiceView.tsx', code);
