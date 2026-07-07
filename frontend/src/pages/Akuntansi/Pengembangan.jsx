import { Result, Typography } from 'antd'
import { ToolOutlined } from '@ant-design/icons'

const { Text } = Typography

export default function Pengembangan({ title = 'Modul' }) {
  return (
    <div style={{ maxWidth: 720 }}>
      <Result
        icon={<ToolOutlined style={{ color: '#ff7a00' }} />}
        title={`${title} dalam pengembangan`}
        subTitle={<Text type="secondary">Modul ini sedang dikunci sementara.</Text>}
      />
    </div>
  )
}
