import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Package,
  History,
  Settings,
  LogOut,
  Search,
  Plus,
  UserMinus,
  MinusCircle,
  Edit,
  Check,
  X,
  AlertTriangle,
  CornerDownLeft,
  FileSpreadsheet,
  User,
  Eye,
  EyeOff,
  Download,
  ChevronDown,
  ChevronUp,
  Printer
} from 'lucide-react';

// Interfaces matching backend models
interface InventoryItem {
  id: number;
  category: string;
  product: string;
  quantity: number;
  container_capacity: number | null;
  required_target: number;
  gap: number;
  notes: string | null;
}

interface Transaction {
  id: number;
  inventory_id: number;
  transaction_type: 'ADDITION' | 'UPDATE' | 'SIGN_OUT' | 'DEDUCTION';
  quantity_changed: number;
  full_name: string | null;
  phone_number: string | null;
  unit: string | null;
  destination: string | null;
  returned_quantity: number;
  transaction_timestamp: string;
  product: string;
  category: string;
  current_quantity: number;
}

export default function App() {
  // Authentication & Session
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem('auth_username'));
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(true);
  const [loginError, setLoginError] = useState('');

  // Navigation & UI tabs: 'inventory' | 'transactions' | 'admin'
  const [activeTab, setActiveTab] = useState<'inventory' | 'transactions' | 'admin'>('inventory');

  // Search & Filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('הכל');
  const [showOnlyShortfalls, setShowOnlyShortfalls] = useState(false);

  // Collapsed categories state
  const [collapsedCategories, setCollapsedCategories] = useState<{ [category: string]: boolean }>({});

  // Data States
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal Overlay States
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [modalMode, setModalMode] = useState<'menu' | 'addition' | 'sign_out' | 'deduction' | 'update' | 'new_item' | 'return'>('menu');
  const [selectedTxForReturn, setSelectedTxForReturn] = useState<Transaction | null>(null);
  const [returnQuantityInput, setReturnQuantityInput] = useState<number>(1);

  // Input states for item action forms
  const [addQty, setAddQty] = useState<number>(1);
  const [deductQty, setDeductQty] = useState<number>(1);
  const [signOutForm, setSignOutForm] = useState({
    qty: 1,
    fullName: '',
    phone: '',
    unit: '',
    destination: ''
  });

  // Comprehensive Update/New Item fields
  const [itemForm, setItemForm] = useState({
    category: '',
    product: '',
    containerCapacity: '',
    requiredTarget: '',
    quantity: '', // only used for creating a new item
    notes: ''
  });

  // returned quantity inline state for transactions
  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [tempReturnQty, setTempReturnQty] = useState<number>(0);

  // Excel Seeding
  const [seedingFile, setSeedingFile] = useState<File | null>(null);
  const [seedingPreview, setSeedingPreview] = useState<any[]>([]);
  const [clearExistingBeforeSeed, setClearExistingBeforeSeed] = useState(true);
  const [importPassword, setImportPassword] = useState('');
  const [isImportUnlocked, setIsImportUnlocked] = useState(false);
  const [importPasswordError, setImportPasswordError] = useState('');

  // Show Toast helper
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Check Session Expiration Client-Side
  useEffect(() => {
    const expiresAtStr = localStorage.getItem('auth_expires_at');
    if (expiresAtStr) {
      const expiresAt = parseInt(expiresAtStr, 10);
      if (Date.now() > expiresAt) {
        handleLogout();
        showToast('פג תוקף החיבור, אנא התחבר מחדש', 'error');
      }
    }
  }, [activeTab]);

  // Fetch Inventory and Transaction logs
  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      // Fetch Inventory
      const invRes = await fetch('/api/inventory', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (invRes.status === 401) {
        handleLogout();
        return;
      }
      const invData = (await invRes.json()) as any;
      if (invRes.ok) {
        setInventory(invData);
      } else {
        showToast(invData.error || 'שגיאה בטעינת המלאי', 'error');
      }

      // Fetch Transactions
      const txRes = await fetch('/api/transactions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const txData = (await txRes.json()) as any;
      if (txRes.ok) {
        setTransactions(txData);
      }
    } catch (e) {
      showToast('שגיאה בחיבור לשרת', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token]);

  // Keep selectedItem updated when inventory list changes
  useEffect(() => {
    if (selectedItem) {
      const updated = inventory.find(item => item.id === selectedItem.id);
      if (updated) {
        setSelectedItem(updated);
      } else {
        setSelectedItem(null); // Item was deleted
      }
    }
  }, [inventory]);

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = (await res.json()) as any;
      if (res.ok) {
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_username', data.username);
        localStorage.setItem('auth_expires_at', String(data.expiresAt));
        setToken(data.token);
        setUsername(data.username);
        showToast(`ברוך הבא, ${data.username}`);
      } else {
        setLoginError(data.error || 'סיסמה שגויה או פרטים חסרים');
      }
    } catch (err) {
      setLoginError('שגיאה בחיבור לשרת');
    } finally {
      setLoading(false);
    }
  };

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_username');
    localStorage.removeItem('auth_expires_at');
    setToken(null);
    setUsername(null);
    setInventory([]);
    setTransactions([]);
  };

  // Get dynamic categories list
  const categories = useMemo(() => {
    const cats = new Set<string>();
    inventory.forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return ['הכל', ...Array.from(cats)];
  }, [inventory]);

  // Get unique categories (without 'הכל') for autocomplete
  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    inventory.forEach(item => {
      if (item.category?.trim()) cats.add(item.category.trim());
    });
    return Array.from(cats);
  }, [inventory]);

  // Get unique product names for autocomplete
  const uniqueProducts = useMemo(() => {
    const prods = new Set<string>();
    inventory.forEach(item => {
      if (item.product?.trim()) prods.add(item.product.trim());
    });
    return Array.from(prods);
  }, [inventory]);

  // Check if current user is authorized to import
  const isAuthorizedToImport = useMemo(() => {
    if (!username) return false;
    const name = username.trim().toLowerCase();
    return name.includes('nirb') || name.includes('tali') || name.includes('taly') || name.includes('טלי');
  }, [username]);

  // Filtered inventory list
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const matchesSearch = item.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'הכל' || item.category === selectedCategory;
      const matchesShortfall = !showOnlyShortfalls || item.gap > 0;
      return matchesSearch && matchesCategory && matchesShortfall;
    });
  }, [inventory, searchTerm, selectedCategory, showOnlyShortfalls]);

  // Group filtered inventory items by category
  const inventoryByCategory = useMemo(() => {
    const groups: { [category: string]: InventoryItem[] } = {};
    filteredInventory.forEach(item => {
      const cat = item.category || 'ללא קטגוריה';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(item);
    });
    return groups;
  }, [filteredInventory]);

  // Toggle category collapse
  const toggleCategory = (category: string) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Form Submissions for Row Operations
  const handleAddQuantity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || addQty <= 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          inventory_id: selectedItem.id,
          transaction_type: 'ADDITION',
          quantity_changed: addQty
        })
      });
      const data = (await res.json()) as any;
      if (res.ok) {
        showToast('המלאי עודכן בהצלחה');
        setSelectedItem(null);
        fetchData();
      } else {
        showToast(data.error || 'שגיאה בעדכון המלאי', 'error');
      }
    } catch (err) {
      showToast('שגיאה בתקשורת עם השרת', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeductQuantity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || deductQty <= 0) return;
    if (deductQty > selectedItem.quantity) {
      showToast('הכמות לגריעה גדולה מהכמות הקיימת במלאי', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          inventory_id: selectedItem.id,
          transaction_type: 'DEDUCTION',
          quantity_changed: deductQty
        })
      });
      const data = (await res.json()) as any;
      if (res.ok) {
        showToast('המלאי נגרע בהצלחה');
        setSelectedItem(null);
        fetchData();
      } else {
        showToast(data.error || 'שגיאה בגריעת מלאי', 'error');
      }
    } catch (err) {
      showToast('שגיאה בתקשורת עם השרת', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || signOutForm.qty <= 0) return;
    if (!signOutForm.fullName.trim()) {
      showToast('יש להזין שם מלא עבור ההחתמה', 'error');
      return;
    }
    if (signOutForm.qty > selectedItem.quantity) {
      showToast(`אין מספיק מלאי. כמות זמינה: ${selectedItem.quantity}`, 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          inventory_id: selectedItem.id,
          transaction_type: 'SIGN_OUT',
          quantity_changed: signOutForm.qty,
          full_name: signOutForm.fullName,
          phone_number: signOutForm.phone,
          unit: signOutForm.unit,
          destination: signOutForm.destination
        })
      });
      const data = (await res.json()) as any;
      if (res.ok) {
        showToast('החתמה נרשמה בהצלחה');
        setSelectedItem(null);
        fetchData();
      } else {
        showToast(data.error || 'שגיאה ברישום ההחתמה', 'error');
      }
    } catch (err) {
      showToast('שגיאה בתקשורת עם השרת', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (!itemForm.category.trim() || !itemForm.product.trim()) {
      showToast('שם קטגוריה ומוצר הם חובה', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/${selectedItem.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          category: itemForm.category.trim(),
          product: itemForm.product.trim(),
          quantity: itemForm.quantity ? parseInt(itemForm.quantity, 10) : 0,
          container_capacity: itemForm.containerCapacity ? parseInt(itemForm.containerCapacity, 10) : null,
          required_target: itemForm.requiredTarget ? parseInt(itemForm.requiredTarget, 10) : 0,
          notes: itemForm.notes.trim() || null
        })
      });
      const data = (await res.json()) as any;
      if (res.ok) {
        showToast('הפריט עודכן בהצלחה');
        setSelectedItem(null);
        fetchData();
      } else {
        showToast(data.error || 'שגיאה בעדכון הפריט', 'error');
      }
    } catch (err) {
      showToast('שגיאה בתקשורת עם השרת', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!selectedItem) return;
    if (!confirm('האם אתה בטוח שברצונך למחוק מוצר זה לצמיתות מהמערכת?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/${selectedItem.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = (await res.json()) as any;
      if (res.ok) {
        showToast('המוצר נמחק מהמערכת בהצלחה');
        setSelectedItem(null);
        fetchData();
      } else {
        showToast(data.error || 'שגיאה במחיקת המוצר', 'error');
      }
    } catch (err) {
      showToast('שגיאה בתקשורת עם השרת', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.category.trim() || !itemForm.product.trim()) {
      showToast('שם קטגוריה ומוצר הם חובה', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          category: itemForm.category.trim(),
          product: itemForm.product.trim(),
          quantity: itemForm.quantity ? parseInt(itemForm.quantity, 10) : 0,
          container_capacity: itemForm.containerCapacity ? parseInt(itemForm.containerCapacity, 10) : null,
          required_target: itemForm.requiredTarget ? parseInt(itemForm.requiredTarget, 10) : 0,
          notes: itemForm.notes.trim() || null
        })
      });
      const data = (await res.json()) as any;
      if (res.ok) {
        showToast('מוצר חדש נוסף בהצלחה');
        setSelectedItem(null);
        fetchData();
      } else {
        showToast(data.error || 'שגיאה בהוספת מוצר חדש', 'error');
      }
    } catch (err) {
      showToast('שגיאה בתקשורת', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Update returned quantity for a transaction
  const handleUpdateReturnQty = async (txId: number) => {
    if (tempReturnQty < 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          transaction_id: txId,
          returned_quantity: tempReturnQty
        })
      });
      const data = (await res.json()) as any;
      if (res.ok) {
        showToast('ההחזרה עודכנה בהצלחה');
        setEditingTxId(null);
        fetchData();
      } else {
        showToast(data.error || 'שגיאה בעדכון ההחזרה', 'error');
      }
    } catch (e) {
      showToast('שגיאה בחיבור לשרת', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Submit a direct check-in/return from the item detail modal
  const handleDirectReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTxForReturn) return;
    if (returnQuantityInput <= 0 || returnQuantityInput > selectedTxForReturn.quantity_changed) {
      showToast(`כמות לא תקינה. הזן מספר בין 1 ל-${selectedTxForReturn.quantity_changed}`, 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          transaction_id: selectedTxForReturn.id,
          return_quantity: returnQuantityInput
        })
      });
      const data = (await res.json()) as any;
      if (res.ok) {
        showToast(data.message || 'ההחזרה בוצעה בהצלחה');
        setModalMode('menu');
        fetchData();
        setSelectedTxForReturn(null);
      } else {
        showToast(data.error || 'שגיאה בביצוע ההחזרה', 'error');
      }
    } catch (e) {
      showToast('שגיאה בחיבור לשרת', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle parsing of Excel locally
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setSeedingFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Parse rows to raw arrays
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

        const previewItems: any[] = [];
        // Row 0 has headers, start parsing from row 1
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r || r.length === 0 || !r[0] || !r[1]) continue;
          previewItems.push({
            category: String(r[0]),
            product: String(r[1]),
            quantity: typeof r[2] === 'number' ? r[2] : 0,
            container_capacity: typeof r[3] === 'number' ? r[3] : null,
            required_target: typeof r[4] === 'number' ? r[4] : 0
          });
        }
        setSeedingPreview(previewItems);
      } catch (err) {
        showToast('קריאת קובץ האקסל נכשלה', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Submit parsed items to database
  const handleCommitSeed = async () => {
    if (seedingPreview.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/inventory/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          items: seedingPreview,
          clearExisting: clearExistingBeforeSeed
        })
      });
      const data = (await res.json()) as any;
      if (res.ok) {
        showToast(`ייבוא הסתיים בהצלחה! ${data.count} פריטים נטענו.`);
        setSeedingFile(null);
        setSeedingPreview([]);
        setActiveTab('inventory');
        fetchData();
      } else {
        showToast(data.error || 'טעינת הנתונים נכשלה', 'error');
      }
    } catch (e) {
      showToast('שגיאה בחיבור לשרת', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Unlock Excel Upload Interface
  const handleUnlockImport = (e: React.FormEvent) => {
    e.preventDefault();
    const val = importPassword.trim().toLowerCase();
    if (val === 'טלי' || val === 'tali' || val === 'taly') {
      setIsImportUnlocked(true);
      setImportPasswordError('');
    } else {
      setImportPasswordError('סיסמת ייבוא שגויה');
    }
  };

  // Export inventory to Excel
  const handleExportToExcel = () => {
    try {
      if (inventory.length === 0) {
        showToast('אין פריטים לייצוא במלאי הנוכחי', 'error');
        return;
      }

      const exportData = inventory.map(item => ({
        'קטגוריה': item.category,
        'שם מוצר': item.product,
        'מלאי נוכחי': item.quantity,
        'תכולת מארז': item.container_capacity ?? '',
        'תקן נדרש': item.required_target,
        'חוסר (פער)': item.quantity - item.required_target
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      worksheet['!dir'] = 'rtl'; // RTL direction support for Excel sheet

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'מלאי חמ"ל');

      const dateStr = new Date().toLocaleDateString('he-IL').replace(/\./g, '-');
      XLSX.writeFile(workbook, `מלאי_חמל_אספקה_${dateStr}.xlsx`);
      showToast('הקובץ יוצא בהצלחה');
    } catch (err) {
      showToast('ייצוא קובץ האקסל נכשל', 'error');
    }
  };

  // Export missing items only to Excel
  const handleExportMissingToExcel = () => {
    try {
      const missingItems = inventory.filter(item => item.gap > 0);
      if (missingItems.length === 0) {
        showToast('אין פריטים בחוסר לייצוא במלאי הנוכחי', 'error');
        return;
      }

      const exportData = missingItems.map(item => ({
        'קטגוריה': item.category,
        'שם מוצר': item.product,
        'מלאי נוכחי': item.quantity,
        'תכולת מארז': item.container_capacity ?? '',
        'תקן נדרש': item.required_target,
        'חוסר (פער)': item.quantity - item.required_target
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      worksheet['!dir'] = 'rtl'; // RTL direction support for Excel sheet

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'חוסרים חמ"ל');

      const dateStr = new Date().toLocaleDateString('he-IL').replace(/\./g, '-');
      XLSX.writeFile(workbook, `חוסרי_מלאי_חמל_${dateStr}.xlsx`);
      showToast('קובץ החוסרים יוצא בהצלחה');
    } catch (err) {
      showToast('ייצוא קובץ האקסל נכשל', 'error');
    }
  };

  // Export inventory to PDF and print
  const handleExportToPDF = (type: 'all' | 'missing') => {
    try {
      const itemsToExport = type === 'all' ? inventory : inventory.filter(item => item.gap > 0);
      if (itemsToExport.length === 0) {
        showToast(type === 'all' ? 'אין פריטים לייצוא במלאי הנוכחי' : 'אין פריטים בחוסר לייצוא במלאי הנוכחי', 'error');
        return;
      }

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        showToast('נא לאפשר חלונות קופצים בדפדפן לצורך ייצוא PDF', 'error');
        return;
      }

      const title = type === 'all' ? 'דוח מלאי פעיל - חמ״ל אספקה' : 'דוח חוסרי מלאי - חמ״ל אספקה';
      const dateStr = new Date().toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

      // Generate HTML string for PDF
      const htmlContent = `
        <!DOCTYPE html>
        <html dir="rtl" lang="he">
        <head>
          <meta charset="UTF-8">
          <title>${title}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;800&display=swap');
            body {
              font-family: 'Assistant', -apple-system, BlinkMacSystemFont, sans-serif;
              padding: 24px;
              color: #0f172a;
              background-color: #ffffff;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 3px double #cbd5e1;
              padding-bottom: 16px;
              margin-bottom: 24px;
            }
            .header h1 {
              font-size: 24px;
              font-weight: 800;
              margin: 0;
            }
            .header .meta {
              font-size: 13px;
              color: #475569;
              text-align: left;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 16px;
              font-size: 14px;
            }
            th, td {
              border: 1px solid #cbd5e1;
              padding: 10px 12px;
              text-align: right;
            }
            th {
              background-color: #f8fafc;
              font-weight: 700;
              color: #0f172a;
            }
            tr:nth-child(even) {
              background-color: #f8fafc;
            }
            .gap-short {
              color: #e11d48;
              font-weight: 700;
            }
            .gap-ok {
              color: #16a34a;
              font-weight: 700;
            }
            .footer {
              margin-top: 40px;
              border-top: 1px solid #e2e8f0;
              padding-top: 12px;
              font-size: 11px;
              color: #94a3b8;
              display: flex;
              justify-content: space-between;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>${title}</h1>
              <div style="font-size: 14px; color: #475569; margin-top: 4px;">מערכת ניהול מלאי וציוד מבצעי</div>
            </div>
            <div class="meta">
              <div>הופק ע״י: ${username || 'חמ״ל'}</div>
              <div>תאריך: ${dateStr}</div>
              <div>סה״כ פריטים: ${itemsToExport.length}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 20%;">קטגוריה</th>
                <th style="width: 35%;">שם מוצר / פריט</th>
                <th style="text-align: center; width: 10%;">כמות במלאי</th>
                <th style="text-align: center; width: 10%;">צורך יעד</th>
                <th style="text-align: center; width: 12%;">פער</th>
                <th style="text-align: center; width: 13%;">במכולה</th>
              </tr>
            </thead>
            <tbody>
              ${itemsToExport.map(item => {
                const gap = item.gap;
                let gapText = '0';
                let gapClass = '';
                if (gap < 0) {
                  gapText = `+${Math.abs(gap)}`;
                  gapClass = 'gap-ok';
                } else if (gap > 0) {
                  gapText = `-${gap}`;
                  gapClass = 'gap-short';
                }

                return `
                  <tr>
                    <td><strong>${item.category}</strong></td>
                    <td>${item.product}</td>
                    <td style="text-align: center; font-weight: 700;">${item.quantity}</td>
                    <td style="text-align: center;">${item.required_target}</td>
                    <td style="text-align: center;" class="${gapClass}">${gapText}</td>
                    <td style="text-align: center;">${item.container_capacity ?? '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div class="footer">
            <span>מערכת חמ״ל אספקה - סודי לשימוש פנימי</span>
            <span>הופק באופן ממוחשב</span>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 300);
            };
          </script>
        </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    } catch (err) {
      showToast('הפקת קובץ PDF נכשלה', 'error');
    }
  };

  // Trigger modal for a specific row
  const openItemModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setModalMode('menu');
    setAddQty(1);
    setDeductQty(1);
    setSignOutForm({
      qty: 1,
      fullName: '',
      phone: '',
      unit: '',
      destination: ''
    });
    setItemForm({
      category: item.category,
      product: item.product,
      containerCapacity: item.container_capacity ? String(item.container_capacity) : '',
      requiredTarget: String(item.required_target),
      quantity: String(item.quantity),
      notes: item.notes || ''
    });
  };

  const openNewItemModal = () => {
    setSelectedItem({
      id: 0,
      category: '',
      product: '',
      quantity: 0,
      container_capacity: null,
      required_target: 0,
      gap: 0,
      notes: null
    });
    setModalMode('new_item');
    setItemForm({
      category: '',
      product: '',
      containerCapacity: '',
      requiredTarget: '',
      quantity: '0',
      notes: ''
    });
  };

  // Transaction type formatting helper
  const formatTxType = (type: Transaction['transaction_type']) => {
    switch (type) {
      case 'ADDITION': return { label: 'הוספת ציוד', color: 'var(--color-success)' };
      case 'SIGN_OUT': return { label: 'החתמת חייל', color: 'var(--color-warning)' };
      case 'DEDUCTION': return { label: 'גריעת מלאי', color: 'var(--color-danger)' };
      case 'UPDATE': return { label: 'עדכון פריט', color: 'var(--color-text-secondary)' };
      default: return { label: type, color: 'var(--color-text-primary)' };
    }
  };

  // Render gap with appropriate styling: green +X for surplus, red -X for shortage
  const renderFormattedGap = (gap: number) => {
    if (gap < 0) {
      // Surplus (e.g. target 10, quantity 12 -> gap is -2. Surplus is +2)
      return (
        <span className="gap-indicator" style={{ color: 'var(--color-success)', fontWeight: 700, direction: 'ltr', display: 'inline-flex', alignItems: 'center' }}>
          +{Math.abs(gap)}
        </span>
      );
    } else if (gap === 0) {
      return <span className="gap-indicator gap-none">0</span>;
    } else {
      // Shortage (e.g. target 10, quantity 7 -> gap is 3. Shortage is -3)
      return (
        <span className="gap-indicator gap-short" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ direction: 'ltr', display: 'inline-block' }}>-{gap}</span>
          <AlertTriangle size={12} />
        </span>
      );
    }
  };

  // Shortage Statistics
  const stats = useMemo(() => {
    let shortfalls = 0;
    let totalItemsCount = 0;
    inventory.forEach(item => {
      totalItemsCount += item.quantity;
      if (item.gap > 0) {
        shortfalls += item.gap;
      }
    });
    return { shortfalls, totalItemsCount };
  }, [inventory]);

  if (!token) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '16px' }}>
        <div style={{ maxWidth: '400px', width: '100%', padding: '28px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'inline-flex', padding: '16px', backgroundColor: 'var(--accent-glow)', borderRadius: '50%', color: 'var(--accent-color)', marginBottom: '16px' }}>
              <Package size={42} />
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '6px' }}>חמ״ל אספקה</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px' }}>מערכת ניהול מלאי וציוד מבצעי</p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="input-group">
              <label className="input-label">שם משתמש (לצורך תיעוד)</label>
              <input
                type="text"
                className="tactical-input"
                placeholder="למשל: אוהד ק."
                value={loginUsername}
                onChange={e => setLoginUsername(e.target.value)}
                required
                style={{ direction: 'rtl', textAlign: 'right' }}
              />
            </div>

            <div className="input-group">
              <label className="input-label">סיסמה מבצעית</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? "text" : "password"}
                  className="tactical-input"
                  placeholder="הזן סיסמת חמ״ל"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  required
                  style={{
                    direction: showPassword ? 'rtl' : 'ltr',
                    textAlign: showPassword ? 'right' : 'left',
                    letterSpacing: showPassword ? 'normal' : '2px',
                    paddingRight: '40px'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px'
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {loginError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', backgroundColor: 'rgba(231, 76, 60, 0.15)', borderRadius: '8px', color: 'var(--color-danger)', fontSize: '14px' }}>
                <AlertTriangle size={18} />
                <span>{loginError}</span>
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={loading} style={{ display: 'flex', justifyContent: 'center', gap: '10px', alignItems: 'center' }}>
              {loading ? 'מתחבר...' : 'כניסה למערכת'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Toast Alert */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 999,
          padding: '12px 20px',
          borderRadius: '8px',
          color: 'var(--accent-text)',
          fontWeight: 700,
          backgroundColor: toast.type === 'error' ? 'var(--color-danger)' : 'var(--accent-color)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {toast.type === 'error' ? <AlertTriangle size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Panel */}
      <header className="header-glass" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '800px', margin: '0 auto' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Package size={20} className="gap-ok" />
              <span>חמ״ל אספקה</span>
            </h2>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <User size={12} />
              <span>מחובר: {username}</span>
            </span>
          </div>
          <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            <LogOut size={14} />
            <span>התנתק</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '800px', width: '100%', margin: '0 auto', padding: '16px' }}>
        {/* View Switch Logic */}

        {/* Tab 1: INVENTORY */}
        {activeTab === 'inventory' && (
          <div>
            {/* Search and Category Filters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {/* Search Bar - on the right (first in RTL flow) */}
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type="text"
                    className="tactical-input"
                    placeholder="חיפוש לפי שם מוצר או קטגוריה..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ paddingRight: '42px', direction: 'rtl', textAlign: 'right' }}
                  />
                  <Search size={18} style={{ position: 'absolute', right: '14px', top: '15px', color: 'var(--color-text-muted)' }} />
                </div>

                {/* Shortfall Card - on the left (second in RTL flow) */}
                <div
                  onClick={() => setShowOnlyShortfalls(prev => !prev)}
                  style={{
                    flex: '0 0 auto',
                    width: '160px',
                    backgroundColor: showOnlyShortfalls ? 'var(--accent-glow)' : 'var(--card-bg)',
                    border: `1px solid ${showOnlyShortfalls ? 'var(--accent-color)' : 'var(--border-color)'}`,
                    borderRadius: '8px',
                    padding: '0 12px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    height: '46px'
                  }}
                  title={showOnlyShortfalls ? "לחץ להצגת כל הפריטים" : "לחץ לסינון פריטים בחוסר בלבד"}
                >
                  <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    {showOnlyShortfalls ? 'חוסרים פעילים' : 'סה״כ חוסר'}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: '800', color: stats.shortfalls > 0 ? 'var(--color-danger)' : 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>{stats.shortfalls.toLocaleString()}</span>
                    {showOnlyShortfalls && <Check size={14} />}
                  </span>
                </div>
              </div>

              {/* Dynamic Category Chips */}
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', whiteSpace: 'nowrap' }}>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '20px',
                      fontSize: '14px',
                      fontWeight: 600,
                      backgroundColor: selectedCategory === cat ? 'var(--accent-color)' : 'var(--card-bg)',
                      color: selectedCategory === cat ? 'var(--accent-text)' : 'var(--color-text-secondary)',
                      border: `1px solid ${selectedCategory === cat ? 'var(--accent-color)' : 'var(--border-color)'}`
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Floating add item on mobile or top button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                מציג {filteredInventory.length} פריטים
              </span>
              <button
                onClick={openNewItemModal}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: 'var(--accent-glow)',
                  color: 'var(--accent-color)',
                  border: '1px solid var(--border-color)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                <Plus size={14} />
                <span>מוצר חדש</span>
              </button>
            </div>

            {/* Grouped tables by Category */}
            {filteredInventory.length === 0 ? (
              <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                לא נמצאו פריטים תואמים
              </div>
            ) : (
              Object.keys(inventoryByCategory).map(category => {
                const items = inventoryByCategory[category];
                const isCollapsed = !!collapsedCategories[category];
                return (
                  <div key={category} style={{ marginBottom: '16px' }}>
                    {/* Category Header */}
                    <div
                      onClick={() => toggleCategory(category)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                      }}
                      className="clickable"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="badge badge-olive" style={{ fontSize: '14px', fontWeight: 'bold' }}>{category}</span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                          ({items.length} {items.length === 1 ? 'פריט' : 'פריטים'})
                        </span>
                      </div>
                      <div style={{ color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center' }}>
                        {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                      </div>
                    </div>

                    {/* Table Container */}
                    {!isCollapsed && (
                      <div className="table-container" style={{ marginTop: '8px', animation: 'fadeIn 0.2s ease-out' }}>
                        <table className="tactical-table">
                          <thead>
                            <tr>
                              <th>מוצר</th>
                              <th style={{ textAlign: 'center' }}>כמות</th>
                              <th style={{ textAlign: 'center' }}>צורך</th>
                              <th style={{ textAlign: 'center' }}>פער</th>
                              <th style={{ textAlign: 'center' }}>במכולה</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map(item => (
                              <tr
                                key={item.id}
                                className="table-row-interactive"
                                onClick={() => openItemModal(item)}
                              >
                                <td style={{ fontWeight: 700, fontSize: '15px' }}>{item.product}</td>
                                <td style={{ textAlign: 'center', fontWeight: '800', fontSize: '16px' }}>{item.quantity}</td>
                                <td style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>{item.required_target}</td>
                                <td style={{ textAlign: 'center' }}>
                                  {renderFormattedGap(item.gap)}
                                </td>
                                <td style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                  {item.container_capacity ?? '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: TRANSACTION LOGS */}
        {activeTab === 'transactions' && (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '12px' }}>יומן תנועות והחתמות ציוד</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {transactions.length === 0 ? (
                <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  טרם נרשמו תנועות במערכת
                </div>
              ) : (
                transactions.map(tx => {
                  const typeDetails = formatTxType(tx.transaction_type);
                  const dt = new Date(tx.transaction_timestamp);
                  const formattedTime = dt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
                  const formattedDate = dt.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });

                  return (
                    <div
                      key={tx.id}
                      style={{
                        backgroundColor: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}
                    >
                      {/* Header Row of Item */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: typeDetails.color, color: '#ffffff' }}>
                              {typeDetails.label}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                              {formattedTime} | {formattedDate}
                            </span>
                          </div>
                          <h4 style={{ fontSize: '16px', fontWeight: '800', marginTop: '6px' }}>
                            {tx.product} <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 'normal' }}>({tx.category})</span>
                          </h4>
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <span style={{ fontSize: '18px', fontWeight: '800', color: typeDetails.color }}>
                            {tx.transaction_type === 'SIGN_OUT' || tx.transaction_type === 'DEDUCTION' ? '-' : '+'}
                            {tx.quantity_changed}
                          </span>
                        </div>
                      </div>

                      {/* SIGN_OUT details */}
                      {tx.transaction_type === 'SIGN_OUT' && (
                        <div style={{ backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '10px', fontSize: '14px', borderLeft: '2px solid var(--color-warning)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', color: 'var(--color-text-secondary)' }}>
                            <div><strong>חייל:</strong> {tx.full_name}</div>
                            <div><strong>טלפון:</strong> {tx.phone_number || '-'}</div>
                            <div><strong>יחידה:</strong> {tx.unit || '-'}</div>
                            <div><strong>לאן:</strong> {tx.destination || '-'}</div>
                          </div>

                          {/* Returns Logic inside Transaction Item */}
                          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px' }}>
                              כמות שחזרה: <strong className="gap-ok">{tx.returned_quantity}</strong> מתוך {tx.quantity_changed}
                            </span>

                            {editingTxId === tx.id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input
                                  type="number"
                                  className="tactical-input"
                                  value={tempReturnQty}
                                  onChange={e => setTempReturnQty(parseInt(e.target.value, 10) || 0)}
                                  min={0}
                                  max={tx.quantity_changed}
                                  style={{ width: '60px', padding: '4px', fontSize: '13px', direction: 'ltr', textAlign: 'center' }}
                                />
                                <button
                                  onClick={() => handleUpdateReturnQty(tx.id)}
                                  style={{ padding: '6px', borderRadius: '4px', backgroundColor: 'var(--accent-color)', color: 'var(--accent-text)' }}
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  onClick={() => setEditingTxId(null)}
                                  style={{ padding: '6px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'white' }}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingTxId(tx.id);
                                  setTempReturnQty(tx.returned_quantity);
                                }}
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--accent-color)' }}
                              >
                                <CornerDownLeft size={12} />
                                <span>עדכן החזרה</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 3: EXCEL IMPORT & ADMIN */}
        {activeTab === 'admin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {isAuthorizedToImport && (
              <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileSpreadsheet size={18} className="gap-ok" />
                  <span>ייבוא מלאי מקובץ Excel (`.xlsx`)</span>
                </h3>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '16px', lineHeight: '1.5' }}>
                  מערכת קוראת את השורות מקובץ האקסל. העמודות חייבות להיות מסודרות לפי: קטגוריה (A), מוצר (B), כמות (C), כמות במכולה (D), וצורך (E).
                </p>

                {!isImportUnlocked ? (
                  <form onSubmit={handleUnlockImport} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '320px', margin: '16px auto 0 auto', padding: '16px', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <label className="input-label" style={{ textAlign: 'center', fontWeight: 'bold' }}>הזן סיסמת ייבוא לאישור הפעולה</label>
                    <input
                      type="password"
                      className="tactical-input"
                      placeholder="הזן סיסמה"
                      value={importPassword}
                      onChange={e => setImportPassword(e.target.value)}
                      required
                      style={{ textAlign: 'center', letterSpacing: '2px' }}
                    />
                    {importPasswordError && (
                      <div style={{ fontSize: '13px', color: 'var(--color-danger)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <AlertTriangle size={14} />
                        <span>{importPasswordError}</span>
                      </div>
                    )}
                    <button type="submit" className="btn-primary" style={{ marginTop: '4px' }}>
                      אישור פתיחת נעילה
                    </button>
                  </form>
                ) : (
                  <>
                    <div style={{ border: '2px dashed var(--border-color)', borderRadius: '8px', padding: '24px', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.1)' }}>
                      <input
                        type="file"
                        id="xlsx-upload"
                        accept=".xlsx"
                        onChange={handleExcelUpload}
                        style={{ display: 'none' }}
                      />
                      <label htmlFor="xlsx-upload" style={{ cursor: 'pointer', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <FileSpreadsheet size={36} className="gap-ok" />
                        <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>לחץ לבחירת קובץ Excel</span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>תומך בקבצי xlsx בלבד</span>
                      </label>
                    </div>

                    {seedingFile && (
                      <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{ fontWeight: 600 }}>קובץ שנבחר: {seedingFile.name}</span>
                          <span className="badge badge-mint">{seedingPreview.length} פריטים התגלו</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                          <input
                            type="checkbox"
                            id="clear-existing"
                            checked={clearExistingBeforeSeed}
                            onChange={e => setClearExistingBeforeSeed(e.target.checked)}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                          <label htmlFor="clear-existing" style={{ fontSize: '14px', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                            מחק את כל המלאי הקיים בבסיס הנתונים לפני הייבוא (מומלץ לטעינה ראשונית)
                          </label>
                        </div>

                        {/* Preview of XLSX items */}
                        <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px', backgroundColor: 'rgba(0,0,0,0.2)', marginBottom: '16px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--color-text-secondary)' }}>
                                <th style={{ textAlign: 'right', padding: '4px' }}>קטגוריה</th>
                                <th style={{ textAlign: 'right', padding: '4px' }}>מוצר</th>
                                <th style={{ textAlign: 'center', padding: '4px' }}>כמות</th>
                                <th style={{ textAlign: 'center', padding: '4px' }}>צורך</th>
                              </tr>
                            </thead>
                            <tbody>
                              {seedingPreview.slice(0, 10).map((p, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                  <td style={{ padding: '4px' }}>{p.category}</td>
                                  <td style={{ padding: '4px' }}>{p.product}</td>
                                  <td style={{ textAlign: 'center', padding: '4px' }}>{p.quantity}</td>
                                  <td style={{ textAlign: 'center', padding: '4px' }}>{p.required_target}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {seedingPreview.length > 10 && (
                            <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '11px', marginTop: '6px' }}>
                              ועוד {seedingPreview.length - 10} פריטים נוספים...
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button onClick={handleCommitSeed} className="btn-primary" disabled={loading}>
                            {loading ? 'טוען נתונים...' : 'אישור וביצוע ייבוא'}
                          </button>
                          <button
                            onClick={() => {
                              setSeedingFile(null);
                              setSeedingPreview([]);
                            }}
                            className="btn-secondary"
                          >
                            ביטול
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={18} className="gap-ok" />
                <span>מרכז ייצוא דוחות</span>
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '16px', lineHeight: '1.5' }}>
                בחר את פורמט הייצוא ואת סוג הנתונים להורדה. דוחות חוסרים יסננו רק פריטים שבהם המלאי הנוכחי נמוך מהתקן הנדרש.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {/* Excel Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: 'rgba(0,0,0,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-color)' }}>
                    <FileSpreadsheet size={16} />
                    <span>קובץ Excel (.xlsx)</span>
                  </h4>
                  <button
                    onClick={handleExportToExcel}
                    className="btn-primary"
                    style={{ padding: '10px', fontSize: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                  >
                    <Download size={14} />
                    <span>ייצוא מלאי מלא</span>
                  </button>
                  <button
                    onClick={handleExportMissingToExcel}
                    className="btn-secondary"
                    style={{ padding: '10px', fontSize: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }}
                  >
                    <AlertTriangle size={14} />
                    <span>ייצוא חוסרים בלבד</span>
                  </button>
                </div>

                {/* PDF Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: 'rgba(0,0,0,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-success)' }}>
                    <Printer size={16} />
                    <span>מסמך PDF להדפסה</span>
                  </h4>
                  <button
                    onClick={() => handleExportToPDF('all')}
                    className="btn-primary"
                    style={{ padding: '10px', fontSize: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, var(--color-success) 0%, #15803d 100%)', boxShadow: 'none' }}
                  >
                    <Printer size={14} />
                    <span>ייצוא מלאי מלא</span>
                  </button>
                  <button
                    onClick={() => handleExportToPDF('missing')}
                    className="btn-secondary"
                    style={{ padding: '10px', fontSize: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                  >
                    <AlertTriangle size={14} />
                    <span>ייצוא חוסרים בלבד</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Item Operations Overlay Modal */}
      {selectedItem && (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="bottom-sheet" onClick={e => e.stopPropagation()}>

            {/* Modal Title Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <span className="badge badge-olive" style={{ marginBottom: '6px' }}>{selectedItem.category || 'חדש'}</span>
                <h3 style={{ fontSize: '18px', fontWeight: '800' }}>
                  {selectedItem.product || 'פריט חדש במערכת'}
                </h3>
              </div>
              <button onClick={() => setSelectedItem(null)} style={{ color: 'var(--color-text-secondary)', padding: '6px' }}>
                <X size={20} />
              </button>
            </div>

            {/* Menu Mode: Choose Action */}
            {modalMode === 'menu' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '12px', marginBottom: '8px', fontSize: '14px' }}>
                  <div><strong>כמות כרגע:</strong> {selectedItem.quantity}</div>
                  <div><strong>כמות במכולה:</strong> {selectedItem.container_capacity ?? 'לא מוגדר'}</div>
                  <div><strong>צורך יעד:</strong> {selectedItem.required_target}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <strong>פער נוכחי:</strong> {renderFormattedGap(selectedItem.gap)}
                  </div>
                </div>

                {selectedItem.notes && (
                  <div style={{
                    backgroundColor: 'var(--accent-glow)',
                    borderRight: '4px solid var(--accent-color)',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '8px',
                    fontSize: '14px',
                    color: 'var(--color-text-secondary)',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap'
                  }}>
                    <strong style={{ color: 'var(--color-text-primary)', display: 'block', marginBottom: '4px' }}>הערות:</strong>
                    {selectedItem.notes}
                  </div>
                )}

                <button
                  onClick={() => setModalMode('addition')}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'right', fontWeight: 600 }}
                >
                  <Plus size={18} className="gap-ok" />
                  <span>[1] הוספת ציוד (מלאי חדש)</span>
                </button>

                <button
                  onClick={() => setModalMode('sign_out')}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'right', fontWeight: 600 }}
                >
                  <UserMinus size={18} style={{ color: 'var(--color-warning)' }} />
                  <span>[2] החתמת חייל (הספקת ציוד)</span>
                </button>

                <button
                  onClick={() => setModalMode('deduction')}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'right', fontWeight: 600 }}
                >
                  <MinusCircle size={18} style={{ color: 'var(--color-danger)' }} />
                  <span>[3] גריעת מלאי (פחת / אובדן)</span>
                </button>

                <button
                  onClick={() => setModalMode('update')}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'right', fontWeight: 600 }}
                >
                  <Edit size={18} style={{ color: 'var(--color-text-secondary)' }} />
                  <span>[4] עדכון מקיף של הגדרות פריט</span>
                </button>

                <button
                  onClick={handleDeleteItem}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', backgroundColor: 'rgba(225,29,72,0.05)', border: '1px solid var(--color-danger)', borderRadius: '8px', textAlign: 'right', fontWeight: 600, color: 'var(--color-danger)' }}
                >
                  <X size={18} />
                  <span>[5] מחיקת פריט מהמערכת (הסרה)</span>
                </button>

                {/* Active sign-outs section */}
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '10px', color: 'var(--color-text-primary)' }}>
                    החתמות פעילות לפריט זה:
                  </h4>
                  {(() => {
                    const activeSignOuts = transactions.filter(
                      tx => tx.inventory_id === selectedItem.id && tx.transaction_type === 'SIGN_OUT' && tx.quantity_changed > 0
                    );
                    if (activeSignOuts.length === 0) {
                      return (
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                          אין החתמות פעילות לפריט זה.
                        </p>
                      );
                    }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
                        {activeSignOuts.map(tx => (
                          <div
                            key={tx.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              backgroundColor: 'rgba(255,255,255,0.02)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '8px',
                              padding: '10px',
                              fontSize: '13px'
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontWeight: 700 }}>{tx.full_name}</span>
                              <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                                יחידה: {tx.unit || 'לא מוגדר'} | יעד: {tx.destination || 'לא מוגדר'}
                              </span>
                              <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>
                                תאריך: {new Date(tx.transaction_timestamp).toLocaleDateString('he-IL')}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontWeight: 800, color: 'var(--color-warning)', direction: 'ltr', display: 'inline-block' }}>
                                {tx.quantity_changed} יח'
                              </span>
                              <button
                                onClick={() => {
                                  setSelectedTxForReturn(tx);
                                  setReturnQuantityInput(tx.quantity_changed);
                                  setModalMode('return');
                                }}
                                className="btn-secondary"
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  borderColor: 'var(--color-success)',
                                  color: 'var(--color-success)',
                                  backgroundColor: 'transparent'
                                }}
                              >
                                <CornerDownLeft size={12} />
                                <span>החזר</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Addition Form */}
            {modalMode === 'addition' && (
              <form onSubmit={handleAddQuantity} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 700 }}>הוספת מלאי מחדש</h4>
                <div className="input-group">
                  <label className="input-label">כמות להוספה</label>
                  <input
                    type="number"
                    className="tactical-input"
                    value={addQty}
                    onChange={e => setAddQty(Math.max(1, parseInt(e.target.value, 10) || 0))}
                    min={1}
                    required
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  <button type="submit" className="btn-primary" disabled={loading}>אישור</button>
                  <button type="button" onClick={() => setModalMode('menu')} className="btn-secondary">חזרה</button>
                </div>
              </form>
            )}

            {/* Deduction Form */}
            {modalMode === 'deduction' && (
              <form onSubmit={handleDeductQuantity} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-danger)' }}>גריעת ציוד מהמלאי (פחת/אובדן)</h4>
                <div className="input-group">
                  <label className="input-label">כמות לגריעה (מקסימום זמין: {selectedItem.quantity})</label>
                  <input
                    type="number"
                    className="tactical-input"
                    value={deductQty}
                    onChange={e => setDeductQty(Math.max(1, parseInt(e.target.value, 10) || 0))}
                    min={1}
                    max={selectedItem.quantity}
                    required
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  <button type="submit" className="btn-danger" disabled={loading}>בצע גריעה</button>
                  <button type="button" onClick={() => setModalMode('menu')} className="btn-secondary">חזרה</button>
                </div>
              </form>
            )}

            {/* Sign-Out (החתמה) Form */}
            {modalMode === 'sign_out' && (
              <form onSubmit={handleSignOut} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-warning)' }}>טופס החתמת ציוד</h4>

                <div className="input-group">
                  <label className="input-label">כמות להחתמה (מקסימום זמין: {selectedItem.quantity})</label>
                  <input
                    type="number"
                    className="tactical-input"
                    value={signOutForm.qty}
                    onChange={e => setSignOutForm({ ...signOutForm, qty: Math.max(1, parseInt(e.target.value, 10) || 0) })}
                    min={1}
                    max={selectedItem.quantity}
                    required
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">שם מלא של החייל/מקבל</label>
                  <input
                    type="text"
                    className="tactical-input"
                    placeholder="שם פרטי ומשפחה"
                    value={signOutForm.fullName}
                    onChange={e => setSignOutForm({ ...signOutForm, fullName: e.target.value })}
                    required
                    style={{ direction: 'rtl', textAlign: 'right' }}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">מספר טלפון</label>
                  <input
                    type="tel"
                    className="tactical-input"
                    placeholder="מספר טלפון ליצירת קשר"
                    value={signOutForm.phone}
                    onChange={e => setSignOutForm({ ...signOutForm, phone: e.target.value })}
                    style={{ direction: 'ltr', textAlign: 'left' }}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">מחלקה/יחידה</label>
                  <input
                    type="text"
                    className="tactical-input"
                    placeholder="למשל: כיתה 1 / מפקדה"
                    value={signOutForm.unit}
                    onChange={e => setSignOutForm({ ...signOutForm, unit: e.target.value })}
                    style={{ direction: 'rtl', textAlign: 'right' }}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">יעד/לאן מיועד הציוד</label>
                  <input
                    type="text"
                    className="tactical-input"
                    placeholder="מכולה / שטח / עמדה"
                    value={signOutForm.destination}
                    onChange={e => setSignOutForm({ ...signOutForm, destination: e.target.value })}
                    style={{ direction: 'rtl', textAlign: 'right' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <button type="submit" className="btn-primary" disabled={loading} style={{ background: 'linear-gradient(135deg, var(--color-warning) 0%, #d35400 100%)', boxShadow: 'none' }}>
                    בצע החתמה
                  </button>
                  <button type="button" onClick={() => setModalMode('menu')} className="btn-secondary">חזרה</button>
                </div>
              </form>
            )}

            {/* Comprehensive Update Form */}
            {modalMode === 'update' && (
              <form onSubmit={handleUpdateItem} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 700 }}>עדכון פרטי מוצר</h4>

                <div className="input-group">
                  <label className="input-label">קטגוריה</label>
                  <input
                    type="text"
                    list="existing-categories"
                    className="tactical-input"
                    placeholder="למשל: לוגיסטיקה, חד'פ"
                    value={itemForm.category}
                    onChange={e => setItemForm({ ...itemForm, category: e.target.value })}
                    required
                    style={{ direction: 'rtl', textAlign: 'right' }}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">שם מוצר / פריט</label>
                  <input
                    type="text"
                    list="existing-products"
                    className="tactical-input"
                    placeholder="למשל: ספסל, פנס ראש"
                    value={itemForm.product}
                    onChange={e => setItemForm({ ...itemForm, product: e.target.value })}
                    required
                    style={{ direction: 'rtl', textAlign: 'right' }}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">כמות במלאי</label>
                  <input
                    type="number"
                    className="tactical-input"
                    placeholder="כמות נוכחית במלאי"
                    value={itemForm.quantity}
                    onChange={e => setItemForm({ ...itemForm, quantity: e.target.value })}
                    required
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">צורך יעד (כמות יעד נדרשת)</label>
                  <input
                    type="number"
                    className="tactical-input"
                    placeholder="כמה צריך שיהיה סה״כ"
                    value={itemForm.requiredTarget}
                    onChange={e => setItemForm({ ...itemForm, requiredTarget: e.target.value })}
                    required
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">כמות במכולה (אופציונלי)</label>
                  <input
                    type="number"
                    className="tactical-input"
                    placeholder="למשל: 10 (משאיר ריק אם אין)"
                    value={itemForm.containerCapacity}
                    onChange={e => setItemForm({ ...itemForm, containerCapacity: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">הערות</label>
                  <textarea
                    className="tactical-input"
                    placeholder="הערות לגבי הפריט..."
                    value={itemForm.notes}
                    onChange={e => setItemForm({ ...itemForm, notes: e.target.value })}
                    rows={2}
                    style={{ direction: 'rtl', textAlign: 'right', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <button type="submit" className="btn-primary" disabled={loading}>שמור שינויים</button>
                  <button type="button" onClick={handleDeleteItem} className="btn-danger" style={{ width: 'auto', paddingLeft: '16px', paddingRight: '16px' }}>מחק פריט</button>
                  <button type="button" onClick={() => setModalMode('menu')} className="btn-secondary" style={{ width: 'auto' }}>ביטול</button>
                </div>
              </form>
            )}

            {/* New Item Form */}
            {modalMode === 'new_item' && (
              <form onSubmit={handleCreateNewItem} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 700 }}>הוספת פריט חדש למלאי</h4>

                <div className="input-group">
                  <label className="input-label">קטגוריה</label>
                  <input
                    type="text"
                    list="existing-categories"
                    className="tactical-input"
                    placeholder="למשל: לוגיסטיקה, חד'פ, חשמל"
                    value={itemForm.category}
                    onChange={e => setItemForm({ ...itemForm, category: e.target.value })}
                    required
                    style={{ direction: 'rtl', textAlign: 'right' }}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">שם מוצר / פריט</label>
                  <input
                    type="text"
                    list="existing-products"
                    className="tactical-input"
                    placeholder="למשל: גנרטור 3KVA"
                    value={itemForm.product}
                    onChange={e => setItemForm({ ...itemForm, product: e.target.value })}
                    required
                    style={{ direction: 'rtl', textAlign: 'right' }}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">כמות ראשונית במלאי</label>
                  <input
                    type="number"
                    className="tactical-input"
                    placeholder="0"
                    value={itemForm.quantity}
                    onChange={e => setItemForm({ ...itemForm, quantity: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">צורך יעד (יעד נדרש)</label>
                  <input
                    type="number"
                    className="tactical-input"
                    placeholder="כמות יעד רצויה"
                    value={itemForm.requiredTarget}
                    onChange={e => setItemForm({ ...itemForm, requiredTarget: e.target.value })}
                    required
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">כמות במכולה (אופציונלי)</label>
                  <input
                    type="number"
                    className="tactical-input"
                    placeholder="למשל: 10"
                    value={itemForm.containerCapacity}
                    onChange={e => setItemForm({ ...itemForm, containerCapacity: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">הערות</label>
                  <textarea
                    className="tactical-input"
                    placeholder="הערות לגבי הפריט..."
                    value={itemForm.notes}
                    onChange={e => setItemForm({ ...itemForm, notes: e.target.value })}
                    rows={2}
                    style={{ direction: 'rtl', textAlign: 'right', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <button type="submit" className="btn-primary" disabled={loading}>הוסף מוצר</button>
                  <button type="button" onClick={() => setSelectedItem(null)} className="btn-secondary">ביטול</button>
                </div>
              </form>
            )}

            {/* Return Form */}
            {modalMode === 'return' && selectedTxForReturn && (
              <form onSubmit={handleDirectReturnSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-success)' }}>
                  החזרת ציוד מ-{selectedTxForReturn.full_name}
                </h4>
                <div style={{ fontSize: '14px', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '12px', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div><strong>פריט:</strong> {selectedItem.product}</div>
                  {selectedTxForReturn.unit && <div><strong>יחידה:</strong> {selectedTxForReturn.unit}</div>}
                  <div><strong>כמות חתומה נוכחית:</strong> {selectedTxForReturn.quantity_changed} יח'</div>
                </div>

                <div className="input-group">
                  <label className="input-label">כמות להחזרה למלאי</label>
                  <input
                    type="number"
                    className="tactical-input"
                    value={returnQuantityInput}
                    onChange={e => setReturnQuantityInput(Math.min(selectedTxForReturn.quantity_changed, Math.max(1, parseInt(e.target.value, 10) || 0)))}
                    min={1}
                    max={selectedTxForReturn.quantity_changed}
                    required
                  />
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    * הזן כמות בין 1 ל-{selectedTxForReturn.quantity_changed}. אם תחזיר את כל ה-{selectedTxForReturn.quantity_changed} יחידות, רשומת ההחתמה תימחק לחלוטין.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  <button type="submit" className="btn-primary" disabled={loading} style={{ backgroundColor: 'var(--color-success)', borderColor: 'var(--color-success)', width: 'auto', paddingLeft: '16px', paddingRight: '16px' }}>
                    {loading ? 'מבצע החזרה...' : 'אישור החזרה'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTxForReturn(null);
                      setModalMode('menu');
                    }}
                    className="btn-secondary"
                    style={{ width: 'auto' }}
                  >
                    ביטול
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* Bottom Sticky Glass Navigation */}
      <nav className="bottom-nav-glass">
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', height: '64px', maxWidth: '800px', margin: '0 auto' }}>
          <button
            onClick={() => { setActiveTab('inventory'); setSelectedCategory('הכל'); setShowOnlyShortfalls(false); }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              color: (activeTab === 'inventory' && !showOnlyShortfalls) ? 'var(--accent-color)' : 'var(--color-text-secondary)'
            }}
          >
            <Package size={22} />
            <span style={{ fontSize: '12px', fontWeight: (activeTab === 'inventory' && !showOnlyShortfalls) ? 'bold' : 'normal' }}>מלאי פעיל</span>
          </button>

          <button
            onClick={() => { setActiveTab('inventory'); setSelectedCategory('הכל'); setShowOnlyShortfalls(true); }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              color: (activeTab === 'inventory' && showOnlyShortfalls) ? 'var(--color-danger)' : 'var(--color-text-secondary)'
            }}
          >
            <AlertTriangle size={22} />
            <span style={{ fontSize: '12px', fontWeight: (activeTab === 'inventory' && showOnlyShortfalls) ? 'bold' : 'normal' }}>חוסרים</span>
          </button>

          <button
            onClick={() => setActiveTab('transactions')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              color: activeTab === 'transactions' ? 'var(--accent-color)' : 'var(--color-text-secondary)'
            }}
          >
            <History size={22} />
            <span style={{ fontSize: '12px', fontWeight: activeTab === 'transactions' ? 'bold' : 'normal' }}>יומן תנועות</span>
          </button>

          <button
            onClick={() => setActiveTab('admin')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              color: activeTab === 'admin' ? 'var(--accent-color)' : 'var(--color-text-secondary)'
            }}
          >
            <Settings size={22} />
            <span style={{ fontSize: '12px', fontWeight: activeTab === 'admin' ? 'bold' : 'normal' }}>ייצוא</span>
          </button>
        </div>
      </nav>

      {/* Datalists for autocomplete */}
      <datalist id="existing-categories">
        {uniqueCategories.map(cat => (
          <option key={cat} value={cat} />
        ))}
      </datalist>
      <datalist id="existing-products">
        {uniqueProducts.map(prod => (
          <option key={prod} value={prod} />
        ))}
      </datalist>
    </>
  );
}
