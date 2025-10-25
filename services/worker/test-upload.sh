#!/bin/bash

# Primero hacer login
echo "1. Login..."
TOKEN=$(curl -s -X POST https://sii-rcv-api.juanirc.workers.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{"rut":"76123456-7","password":"miclave123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "Token: ${TOKEN:0:20}..."

# Crear un PDF de prueba
echo "2. Creando PDF de prueba..."
echo "Contrato de prueba - contenido simple" > /tmp/test-contract.txt

# Subir contrato
echo "3. Subiendo contrato..."
curl -X POST https://sii-rcv-api.juanirc.workers.dev/api/contratos \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/test-contract.txt" \
  -v

echo ""
echo "4. Esperando 5 segundos para que Vectorize procese..."
sleep 5

echo "5. Listo! Ahora puedes verificar con:"
echo "   wrangler vectorize list-vectors contract_index"
