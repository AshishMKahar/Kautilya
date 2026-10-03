// MOCK payment gateway + mock bank. Same interface a real provider (Razorpay Route, Cashfree, etc.) would implement,
// so swapping later means writing one adapter, not touching order logic. No real money ever moves here.
import {randToken} from './security.js';
export const MOCK=process.env.MOCK_PAYMENTS!=='0';
export function mockGateway(){ return {name:'mock',
  async charge({orderId,amount,simulate}){ if(simulate==='fail') return {ok:false,error:'Payment declined (simulated)'}; return {ok:true,paymentId:'mock_pay_'+randToken(9),heldAmount:amount,orderId}; },
  async refund({paymentId,amount}){ return {ok:!!paymentId,refundId:'mock_rfd_'+randToken(9),amount}; },
  async payout({sellerUpi,amount}){ return {ok:!!sellerUpi,payoutId:'mock_pot_'+randToken(9),amount}; }}; }
// Mock "penny-drop": a real bank would credit Rs 1 to the UPI ID with a code in the narration. Here the narration is simply returned
// to the app, and only outside production (see exposeMockCode). It proves the flow, not ownership, until a real provider replaces it.
export const mockBank={ narration:code=>`UPI/CR/KAUTILYA/VERIFY ${code}`, amount:1 };
