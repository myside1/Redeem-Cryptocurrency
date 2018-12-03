'use strict'

import bitcoin from 'bitcoinjs-lib';
import Bigi from 'bigi';
import axios from 'axios';

export default class MintCoin {
  constructor(option) {
    this.privateKeys = option.privateKeys
    this.payeeAddress = option.payeeAddress
    this.requestUtxo = option.requestUtxo
    this.needFees = option.needFees || 0
    this.network = option.network === 'bitcoin' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet
    this.allUtxo = []
    this.totalAmount = []
    this.totalFees = 0
    this.getAllUtxo()
    this.calucateFees()
  }

  verifyMiniPrivateKey(key) {
    var sha256 = bitcoin.crypto.sha256(key + '?')
    if (sha256.toString('hex').substr(0, 2) === '00') {
      return true
    }
  
    return false
  }

  createKeyPair(privateKey, isMini, compressed) {
    var buffer
    var d
    var ECPair = bitcoin.ECPair
    var ECPairFromWIF = ECPair.fromWIF
    isMini = typeof isMini !== 'undefined' ? isMini : true
    compressed = typeof compressed !== 'undefined' ? compressed : false
  
    if (isMini) {
      buffer = bitcoin.crypto.sha256(privateKey)
      d = Bigi.fromBuffer(buffer)
      return new ECPair(d, null, {
        compressed: compressed,
        network: this.network
      })
    }
  
    return new ECPairFromWIF(privateKey, this.network)
  }

  getAmountSatoshis(allUtxo) {
    if (allUtxo.length === 1) {
      return allUtxo[0].amount
    }
    let totalAmount = 0
    allUtxo.forEach((utxo, index) => {
      totalAmount = totalAmount + utxo.amount
    })
    return totalAmount
  }

  buildTransaction(needFees) {
    return this.getAllUtxo()
    .then(allUtxo => {
      console.log(allUtxo)
      allUtxo = [].concat.apply([],allUtxo)
      const TransactionBuilder = bitcoin.TransactionBuilder
      const tx = new TransactionBuilder(this.network)
      allUtxo.forEach((utxo, index) => {
        tx.addInput(utxo.txid, utxo.vout)
      })
      let fees = 0
      console.log(this.totalFees)
      if (needFees) {
        fees = this.totalFees
      }
      tx.addOutput(this.payeeAddress, this.getAmountSatoshis(allUtxo) - fees)
      allUtxo.forEach((utxo, index) => {
        tx.sign(index, utxo.keyPair)
      })
      return tx
    })
  }

  calucateFees() {
    if (this.totalFees) {
      return Promise.resolve(this.totalFees)
    }
    return this.fetchFeePerByte()
      .then(FeePerByte => {
        return this.buildTransaction(false)
          .then(transaction => {
            const transactionLength = (transaction.build().toHex() + '').length
            const allUtxo = this.allUtxo.length ? this.allUtxo.length : this.getAllUtxo()
            const allByteLength = (transactionLength/2) + (allUtxo * 106)
            this.totalFees = allByteLength * FeePerByte
            return allByteLength * FeePerByte
          })
      })
  }
  
  fetchFeePerByte() {
    return new Promise((resolve, reject) => {
      resolve(
        fetch('https://bitcoinfees.21.co/api/v1/fees/recommended',
          {method: 'GET'})
        .then(response => response.json())
        .then(data => data.halfHourFee)
      )
    })
  }

  getUtxoByPrivateKey(privateKey) {
    const keyPair = this.createKeyPair(privateKey, this.verifyMiniPrivateKey(privateKey), true)
    const keyPairAddress = keyPair.getAddress()
    return this.requestUtxo(keyPairAddress)
    .then(data => data.utxos.map((utxo => {
      utxo.keyPair = keyPair
      utxo.privateKey = privateKey
      return utxo
    })))
  }

  getAllUtxo() {
    if (this.allUtxo.length) {
      return Promise.resolve(this.allUtxo)
    }
    const promises = this.privateKeys.map(privateKey => this.getUtxoByPrivateKey(privateKey))
    return Promise.all(promises).then((results) =>{
      this.allUtxo = [].concat.apply([],results)
      // [].concat.apply([],results)
      return results
    })
  }

  redeem() {
    return this.buildTransaction(this.needFees)
      .then(transaction => {
        return transaction.build().toHex()
      })
  }
}