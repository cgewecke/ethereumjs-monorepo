import {
  Address,
  BN,
  bnToHex,
  bnToRlp,
  ecrecover,
  keccak256,
  rlp,
  rlphash,
  toBuffer,
} from 'ethereumjs-util'
import { BaseTransaction } from './baseTransaction'
import { EIP2930TxData, TxOptions, JsonEIP2930Tx } from './types'

// secp256k1n/2
const N_DIV_2 = new BN('7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0', 16)

export class EIP2930Transaction extends BaseTransaction<JsonEIP2930Tx, EIP2930Transaction> {
  public readonly chainId: BN
  public readonly accessList: any
  public readonly yParity?: number
  public readonly r?: BN
  public readonly s?: BN

  // EIP-2930 alias for `s`
  get senderS() {
    return this.s
  }

  // EIP-2930 alias for `r`
  get senderR() {
    return this.r
  }

  public static fromTxData(txData: EIP2930TxData, opts?: TxOptions) {
    return new EIP2930Transaction(txData, opts ?? {})
  }

  // Instantiate a transaction from the raw RLP serialized tx. This means that the RLP should start with 0x01.
  public static fromRlpSerializedTx(serialized: Buffer, opts?: TxOptions) {
    if (serialized[0] !== 1) {
      throw 'This is not an EIP-2930 transaction'
    }

    const values = rlp.decode(serialized.slice(1))

    if (!Array.isArray(values)) {
      throw new Error('Invalid serialized tx input. Must be array')
    }

    return EIP2930Transaction.fromValuesArray(values, opts)
  }

  // Create a transaction from a values array.
  // The format is: chainId, nonce, gasPrice, gasLimit, to, value, data, access_list, [yParity, senderR, senderS]
  public static fromValuesArray(values: Buffer[], opts?: TxOptions) {
    if (values.length == 8 || values.length == 11) {
      const [
        chainId,
        nonce,
        gasPrice,
        gasLimit,
        to,
        value,
        data,
        accessList,
        yParity,
        r,
        s,
      ] = values
      const emptyBuffer = Buffer.from([])

      return new EIP2930Transaction(
        {
          chainId: new BN(chainId),
          nonce: new BN(nonce),
          gasPrice: new BN(gasPrice),
          gasLimit: new BN(gasLimit),
          to: to && to.length > 0 ? new Address(to) : undefined,
          value: new BN(value),
          data: data ?? emptyBuffer,
          accessList: accessList ?? emptyBuffer,
          yParity:
            yParity !== undefined && !yParity.equals(emptyBuffer)
              ? parseInt(yParity.toString('hex'), 16)
              : undefined,
          r: r !== undefined && !r?.equals(emptyBuffer) ? new BN(r) : undefined,
          s: s !== undefined && !s?.equals(emptyBuffer) ? new BN(s) : undefined,
        },
        opts ?? {}
      )
    } else {
      throw new Error(
        'Invalid EIP-2930 transaction. Only expecting 8 values (for unsigned tx) or 11 values (for signed tx).'
      )
    }
  }

  protected constructor(txData: EIP2930TxData, opts: TxOptions) {
    const {
      chainId,
      nonce,
      gasPrice,
      gasLimit,
      to,
      value,
      data,
      accessList,
      yParity,
      r,
      s,
    } = txData

    super({ nonce, gasPrice, gasLimit, to, value, data }, opts)

    if (!this.common.eips().includes(2718)) {
      throw new Error('EIP-2718 not enabled on Common')
    } else if (!this.common.eips().includes(2930)) {
      throw new Error('EIP-2930 not enabled on Common')
    }

    if (txData.chainId?.eqn(this.common.chainId())) {
      throw new Error('The chain ID does not match the chain ID of Common')
    }

    if (txData.yParity && txData.yParity != 0 && txData.yParity != 1) {
      throw new Error('The y-parity of the transaction should either be 0 or 1')
    }

    // TODO: verify the signature.

    this.yParity = txData.yParity
    this.r = txData.r
    this.s = txData.s

    this.chainId = new BN(toBuffer(chainId))
    this.accessList = accessList ?? []
    this.yParity = yParity ?? 0
    this.r = r ? new BN(toBuffer(r)) : undefined
    this.s = s ? new BN(toBuffer(s)) : undefined

    // todo verify max BN of r,s

    // Verify the access list format.
    for (let key = 0; key < this.accessList.length; key++) {
      const accessListItem = this.accessList[key]
      const address: Buffer = accessListItem[0]
      const storageSlots: Buffer[] = accessListItem[1]
      if (accessListItem[2] !== undefined) {
        throw new Error(
          'Access list item cannot have 3 elements. It can only have an address, and an array of storage slots.'
        )
      }
      if (address.length != 20) {
        throw new Error('Invalid EIP-2930 transaction: address length should be 20 bytes')
      }
      for (let storageSlot = 0; storageSlot < storageSlots.length; storageSlot++) {
        if (storageSlots[storageSlot].length != 32) {
          throw new Error('Invalid EIP-2930 transaction: storage slot length should be 32 bytes')
        }
      }
    }

    const freeze = opts?.freeze ?? true
    if (freeze) {
      Object.freeze(this)
    }
  }

  getMessageToSign() {
    const base = [
      Buffer.from('01', 'hex'),
      bnToRlp(this.chainId),
      bnToRlp(this.nonce),
      bnToRlp(this.gasPrice),
      bnToRlp(this.gasLimit),
      this.to !== undefined ? this.to.buf : Buffer.from([]),
      bnToRlp(this.value),
      this.data,
      this.accessList,
    ]
    return rlphash(Buffer.from(base))
  }

  /**
   * The amount of gas paid for the data in this tx
   */
  getDataFee(): BN {
    const cost = super.getDataFee()
    const accessListStorageKeyCost = this.common.param('gasPrices', 'accessListStorageKeyCost')
    const accessListAddressCost = this.common.param('gasPrices', 'accessListAddressCost')

    let slots = 0
    for (let index = 0; index < this.accessList.length; index++) {
      const item = this.accessList[index]
      const storageSlots = item[1]
      slots += storageSlots.length
    }

    const addresses = this.accessList.length
    cost.iaddn(addresses * accessListAddressCost + slots * accessListStorageKeyCost)
    return cost
  }

  /**
   * Returns a Buffer Array of the raw Buffers of this transaction, in order.
   * TODO: check what raw means - is this the raw transaction as in block body?
   * If that is the case, it is only callable if it is signed.
   */
  raw(): Buffer[] {
    const base = [
      bnToRlp(this.chainId),
      bnToRlp(this.nonce),
      bnToRlp(this.gasPrice),
      bnToRlp(this.gasLimit),
      this.to !== undefined ? this.to.buf : Buffer.from([]),
      bnToRlp(this.value),
      this.data,
      this.accessList,
    ]
    if (this.isSigned()) {
      return base.concat([
        this.yParity == 0 ? Buffer.from('00', 'hex') : Buffer.from('01', 'hex'),
        bnToRlp(this.r!),
        bnToRlp(this.s!),
      ])
    } else {
      return base
    }
  }

  /**
   * Returns the rlp encoding of the transaction.
   */
  serialize(): Buffer {
    const RLPEncodedTx = rlp.encode(this.raw())

    return Buffer.concat([Buffer.from('01', 'hex'), RLPEncodedTx])
  }

  /**
   * Returns an object with the JSON representation of the transaction
   */
  toJSON(): JsonEIP2930Tx {
    // TODO: fix type
    const accessListJSON = []
    for (let index = 0; index < this.accessList.length; index++) {
      const item: any = this.accessList[index]
      const JSONItem: any = ['0x' + (<Buffer>item[0]).toString('hex')]
      const storageSlots: Buffer[] = item[1]
      const JSONSlots = []
      for (let slot = 0; slot < storageSlots.length; slot++) {
        const storageSlot = storageSlots[slot]
        JSONSlots.push('0x' + storageSlot.toString('hex'))
      }
      JSONItem.push(JSONSlots)
      accessListJSON.push(JSONItem)
    }

    return {
      chainId: bnToHex(this.chainId),
      nonce: bnToHex(this.nonce),
      gasPrice: bnToHex(this.gasPrice),
      gasLimit: bnToHex(this.gasLimit),
      to: this.to !== undefined ? this.to.toString() : undefined,
      value: bnToHex(this.value),
      data: '0x' + this.data.toString('hex'),
      accessList: accessListJSON,
    }
  }

  public isSigned(): boolean {
    const { yParity, r, s } = this
    return yParity !== undefined && !!r && !!s
  }

  public hash(): Buffer {
    // TODO add decorator
    if (!this.isSigned()) {
      throw new Error('Cannot call hash method if transaction is not signed')
    }

    return keccak256(Buffer.from(this.raw()))
  }

  public getMessageToVerifySignature(): Buffer {
    return this.getMessageToSign()
  }

  public getSenderPublicKey(): Buffer {
    if (!this.isSigned()) {
      throw new Error('Cannot call this method if transaction is not signed')
    }

    const msgHash = this.getMessageToVerifySignature()

    // All transaction signatures whose s-value is greater than secp256k1n/2 are considered invalid.
    // TODO: verify if this is the case for EIP-2930
    if (this.common.gteHardfork('homestead') && this.s && this.s.gt(N_DIV_2)) {
      throw new Error(
        'Invalid Signature: s-values greater than secp256k1n/2 are considered invalid'
      )
    }

    const { yParity, r, s } = this
    if (yParity === undefined || !r || !s) {
      throw new Error('Missing values to derive sender public key from signed tx')
    }

    try {
      return ecrecover(
        msgHash,
        yParity + 27, // Recover the 27 which was stripped from ecsign
        bnToRlp(r),
        bnToRlp(s)
      )
    } catch (e) {
      throw new Error('Invalid Signature')
    }
  }

  processSignature(v: number, r: Buffer, s: Buffer) {
    const opts = {
      common: this.common,
    }

    return EIP2930Transaction.fromTxData(
      {
        chainId: this.chainId,
        nonce: this.nonce,
        gasPrice: this.gasPrice,
        gasLimit: this.gasLimit,
        to: this.to,
        value: this.value,
        data: this.data,
        accessList: this.accessList,
        yParity: v - 27, // This looks extremely hacky: ethereumjs-util actually adds 27 to the value, the recovery bit is either 0 or 1.
        r: new BN(r),
        s: new BN(s),
      },
      opts
    )
  }
}
