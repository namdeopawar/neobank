import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { accountApi } from '../services/api';

interface Account {
  id: string;
  accountNumber: string;
  accountType: string;
  currency: string;
  balance: number;
  availableBalance: number;
  status: string;
}

interface AccountState {
  accounts: Account[];
  loading: boolean;
  error: string | null;
}

const initialState: AccountState = { accounts: [], loading: false, error: null };

export const fetchAccounts = createAsyncThunk('accounts/fetchAll', async (customerId: string, { rejectWithValue }) => {
  try {
    const response = await accountApi.getCustomerAccounts(customerId);
    return response.data.accounts;
  } catch (err: any) {
    return rejectWithValue(err.response?.data?.error || 'Failed to fetch accounts');
  }
});

const accountSlice = createSlice({
  name: 'accounts',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAccounts.pending, (state) => { state.loading = true; })
      .addCase(fetchAccounts.fulfilled, (state, action) => { state.loading = false; state.accounts = action.payload; })
      .addCase(fetchAccounts.rejected, (state, action) => { state.loading = false; state.error = action.payload as string; });
  },
});

export default accountSlice.reducer;
