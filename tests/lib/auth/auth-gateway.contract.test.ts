import { authGatewayContract } from '../../_contracts/auth-gateway.contract'
import { FakeAuthGateway } from '@/lib/auth/fake-auth-gateway'

// T1f — roda o contrato contra o adapter fake.
authGatewayContract(() => new FakeAuthGateway())
