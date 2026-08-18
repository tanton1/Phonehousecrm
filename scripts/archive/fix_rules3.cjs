const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

const toReplace = `    match /{document=**} {
      allow read, write: if false;
    }
  }
}

    match /spareParts/{partId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && isGlobalAccess();
    }`;

const replacement = `    match /spareParts/{partId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && isGlobalAccess();
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}`;

rules = rules.replace(toReplace, replacement);
fs.writeFileSync('firestore.rules', rules);
