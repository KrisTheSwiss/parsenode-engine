import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import WebSocket from 'ws';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials in .env');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    transport: WebSocket
  }
});

function parseHtmlPayload(html: string): string {
  console.log(`Parsing HTML payload (${html.length} bytes)...`);
  return "extracted_data_stub";
}

async function processIncomingRequest(apiKeyHash: string, htmlPayload: string) {
  console.log("--- Processing Request ---");

  const { data: authData, error: authError } = await supabase.rpc('authenticate_api_key', {
    p_key_hash: apiKeyHash
  });

  if (authError || !authData || authData.length === 0) {
    console.error("Authentication failed: Invalid or inactive API key.");
    if (authError) console.error("Auth DB Error:", authError.message);
    return;
  }

  const { wallet_address, balance } = authData[0];
  console.log(`Authenticated wallet: ${wallet_address} | Balance: ${balance}`);

  const executionCost = 1;
  if (balance < executionCost) {
    console.error("Request rejected: Insufficient balance.");
    return;
  }

  const extractedData = parseHtmlPayload(htmlPayload);

  const { data: debitSuccess, error: debitError } = await supabase.rpc('debit_wallet_balance', {
    p_wallet_address: wallet_address,
    p_amount: executionCost
  });

  if (debitError || !debitSuccess) {
    console.error("Transaction failed: Charge could not be processed.");
    if (debitError) console.error("Database Error Details:", debitError.message);
    return;
  }

  console.log(`Transaction successful. Remaining balance: ${balance - executionCost}`);
  console.log(`Result dispatched to client:`, extractedData);
}

const mockHtml = "<html><body><div id='target'>ParseNode payload</div></body></html>";
processIncomingRequest('dummy_hash_value_for_sk_test_123', mockHtml);