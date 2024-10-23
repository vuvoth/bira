// Importing the bitcoin lib
import * as bitcoin from 'bitcoinjs-lib';

// @ts-ignore
import { BufferWriter } from 'bitcoinjs-lib/src/bufferutils';

import { sha256 } from "@noble/hashes/sha256";
import * as varuint from 'varuint-bitcoin'

import axios from 'axios';

function varSliceSize(someScript: Buffer): number {
	const length = someScript.length;
	console.log(varuint)
	return varuint.encodingLength(length) + length;
}

function txBytesToSign(
	tx: bitcoin.Transaction,
	inIndex: number,
	prevOutScript: Buffer,
	value: number,
	hashType: number,
): Buffer {
	const ZERO: Buffer = Buffer.from(
		'0000000000000000000000000000000000000000000000000000000000000000',
		'hex',
	);

	let tbuffer: Buffer = Buffer.from([]);
	let bufferWriter: BufferWriter;

	let hashOutputs = ZERO;
	let hashPrevouts = ZERO;
	let hashSequence = ZERO;

	if (!(hashType & bitcoin.Transaction.SIGHASH_ANYONECANPAY)) {
		tbuffer = Buffer.allocUnsafe(36 * tx.ins.length);
		bufferWriter = new BufferWriter(tbuffer, 0);

		tx.ins.forEach(txIn => {
			bufferWriter.writeSlice(txIn.hash);
			bufferWriter.writeUInt32(txIn.index);
		});

		hashPrevouts = Buffer.from(sha256(sha256(tbuffer)));
	}

	if (
		!(hashType & bitcoin.Transaction.SIGHASH_ANYONECANPAY) &&
		(hashType & 0x1f) !== bitcoin.Transaction.SIGHASH_SINGLE &&
		(hashType & 0x1f) !== bitcoin.Transaction.SIGHASH_NONE
	) {
		tbuffer = Buffer.allocUnsafe(4 * tx.ins.length);
		bufferWriter = new BufferWriter(tbuffer, 0);

		tx.ins.forEach(txIn => {
			bufferWriter.writeUInt32(txIn.sequence);
		});

		hashSequence = Buffer.from(sha256(sha256(tbuffer)));
	}

	if (
		(hashType & 0x1f) !== bitcoin.Transaction.SIGHASH_SINGLE &&
		(hashType & 0x1f) !== bitcoin.Transaction.SIGHASH_NONE
	) {
		const txOutsSize = tx.outs.reduce((sum, output) => {
			return sum + 8 + varSliceSize(output.script as Buffer);
		}, 0);

		tbuffer = Buffer.allocUnsafe(txOutsSize);
		bufferWriter = new BufferWriter(tbuffer, 0);

		tx.outs.forEach(out => {
			bufferWriter.writeUInt64(out.value);
			bufferWriter.writeVarSlice(out.script);
		});

		hashOutputs = Buffer.from(sha256(sha256(tbuffer)));
	} else if (
		(hashType & 0x1f) === bitcoin.Transaction.SIGHASH_SINGLE &&
		inIndex < tx.outs.length
	) {
		const output = tx.outs[inIndex];

		tbuffer = Buffer.allocUnsafe(8 + varSliceSize(output.script as Buffer));
		bufferWriter = new BufferWriter(tbuffer, 0);
		bufferWriter.writeUInt64(output.value);
		bufferWriter.writeVarSlice(output.script);

		hashOutputs = Buffer.from(sha256(sha256(tbuffer)));
	}

	tbuffer = Buffer.allocUnsafe(156 + varSliceSize(prevOutScript));
	bufferWriter = new BufferWriter(tbuffer, 0);

	const input = tx.ins[inIndex];
	bufferWriter.writeInt32(tx.version);
	bufferWriter.writeSlice(hashPrevouts);
	bufferWriter.writeSlice(hashSequence);
	bufferWriter.writeSlice(input.hash);
	bufferWriter.writeUInt32(input.index);
	bufferWriter.writeVarSlice(prevOutScript);
	bufferWriter.writeUInt64(value);
	bufferWriter.writeUInt32(input.sequence);
	bufferWriter.writeSlice(hashOutputs);
	bufferWriter.writeUInt32(tx.locktime);
	bufferWriter.writeUInt32(hashType);

	return tbuffer;
}
// Getting the unspent transaction output for a given address
async function getUTXO(address: string): Promise<{ utxo: any; txid: string; vout: number; satoshis: number; }> {
	const utxoUrl = `https://blockstream.info/testnet/api/address/${address}/utxo`;
	const { data: utxos } = await axios.get(utxoUrl);

	if (utxos.length === 0) {
		throw new Error('No UTXOs found for this address');
	}

	// Taking the first unspent transaction. 
	// You can change and return them all and to choose or to use more than one input.
	const utxo = utxos[0];
	const txid = utxo.txid;
	const vout = utxo.vout;
	const satoshis = utxo.value;

	return { utxo: utxo, txid: txid, vout: vout, satoshis: satoshis }
}


export {
	txBytesToSign,
	getUTXO,
}
