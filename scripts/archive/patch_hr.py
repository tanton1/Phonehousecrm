import re

def replace_hr(filepath, role):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Import StaffHRView instead of HRHubView
    content = content.replace("import { HRHubView } from './HRHubView';", "import { StaffHRView } from './StaffHRView';")
    
    # Replace <HRHubView /> with <StaffHRView />
    if role == 'SALES':
        content = content.replace("<HRHubView />", f"<StaffHRView currentUser={{currentUser}} roleType='{role}' />")
    else:
        content = content.replace("<HRHubView />", f"<StaffHRView currentUser={{currentUser}} roleType='{role}' />")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

replace_hr('src/components/SalesWorkspaceView.tsx', 'SALES')
replace_hr('src/components/TechWorkspaceView.tsx', 'TECH')
print("HR Views updated.")
